// Detached from SessionEnd. Turns the session into team-visible context:
//   ticket branch -> WIP commit (if secret-scan clean) + push + draft PR + AI handoff comment
//   any branch    -> AI journal note in the central brain: projects/<repo>/journal/ (one file per session)
// Never touches the default branch's history, never commits during a merge/rebase, never commits on a branch
// other than the one the session ended on, never changes the person's staging (the scan and commit use a private
// index). The journal is built straight on the brain's main with git plumbing: the brain clone is never touched.
import { readFileSync, writeFileSync, existsSync, rmSync, copyFileSync, mkdtempSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { sh, trySh, issueFromBranch, hasSecret, redact, claude, log, HANDOFF_MARK, isHarnessRepo, SECRET_FILE_RE, repoFromUrl,
  gitOperationInProgress, parseSections, brainDir, brainProject, brainRepo, acquireLock } from "./lib.mjs";

const payloadFile = process.argv[2];
let input;
try { input = JSON.parse(readFileSync(payloadFile, "utf8")); } finally {
  // Remove only what session-end created: the file, and its private mkdtemp dir. Never a caller's directory.
  try { rmSync(payloadFile, { force: true }); if (basename(dirname(payloadFile)).startsWith("harness-handoff-")) rmSync(dirname(payloadFile), { recursive: true }); } catch {}
}

// One worker per repo at a time (two sessions ending together would race on the index and the push). A second
// worker waits its turn (up to 10 minutes) instead of dropping its handoff.
let release = null;
{
  const root = trySh("git", ["rev-parse", "--show-toplevel"], { cwd: input.cwd });
  // --git-common-dir: sibling worktrees share one repo, so they share one lock.
  const common = root && trySh("git", ["rev-parse", "--git-common-dir"], { cwd: root });
  if (common) {
    release = acquireLock(resolve(root, common, "harness-handoff.lock"), 10 * 60_000);
    if (!release) { log(`handoff skip: another handoff held the lock for 10 minutes in ${input.cwd}`); process.exit(0); }
  }
}
try { await main(); } catch (e) { log(`handoff error: ${e.message}`); } finally { release?.(); }

function transcriptText(path) {
  if (!existsSync(path)) return "";
  const parts = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e.type !== "user" && e.type !== "assistant") continue;
    const c = e.message?.content;
    const text = typeof c === "string" ? c : Array.isArray(c) ? c.filter((b) => b.type === "text").map((b) => b.text).join("\n") : "";
    if (text.trim()) parts.push(`${e.type.toUpperCase()}: ${text.trim()}`);
  }
  return parts.length < 4 ? "" : parts.join("\n\n").slice(-60_000);
}

async function main() {
  const root = trySh("git", ["rev-parse", "--show-toplevel"], { cwd: input.cwd });
  if (!root || !isHarnessRepo(root)) return;
  const git = (...a) => sh("git", a, { cwd: root });
  const tryGit = (...a) => trySh("git", a, { cwd: root });
  const transcript = transcriptText(input.transcript_path);
  if (!transcript) return log(`handoff skip: short session ${input.session_id}`);

  const branch = tryGit("branch", "--show-current") || "";
  const defBranch = (tryGit("symbolic-ref", "--short", "refs/remotes/origin/HEAD") || "origin/main").replace(/^origin\//, "");
  const issue = branch === defBranch ? null : issueFromBranch(branch);
  const diffStat = tryGit("diff", "--stat", "HEAD") || "";
  const author = tryGit("config", "user.name") || "unknown";

  const raw = claude(`You write session handoffs for a software team. Read the session transcript and git diff stat.
Return exactly these three sections and nothing else, each header on its own line:
=== HANDOFF ===
<markdown with sections ### Done, ### In progress, ### Next step, ### Blockers / open questions — short bullets, file paths where useful>
=== JOURNAL ===
<markdown: decisions made, conventions agreed, gotchas learned that OTHER teammates need. Leave empty if none>
=== TITLE ===
<3-6 word kebab-case slug for the journal file>
Never include secrets, tokens, passwords, emails or personal data. No mention of AI or Claude.

Branch: ${branch} ${issue ? `(ticket #${issue})` : ""}
Diff stat:\n${diffStat}\n\nTRANSCRIPT:\n${transcript}`);
  const json = parseSections(raw);
  if (!json.handoff && !json.journal) return log(`handoff: model output had no sections (${input.session_id})`);
  const handoff = redact(json.handoff || "");
  const journal = redact(json.journal || "");

  // Journal -> central brain, projects/<repo>/journal/: one file per session, so teammates never conflict.
  if (journal.trim()) writeJournal(root, { journal, title: json.title, author, branch, issue });

  if (!issue) return log(`handoff: journal only (${branch})`);
  const busy = gitOperationInProgress(root);
  if (busy) return log(`handoff: ${busy} in progress on ${branch} — no WIP commit, push or comment`);

  // Outward actions (push, PR, comment) only for private/internal repos: a WIP diff or a
  // session summary must never land somewhere public.
  // Check the repo we will actually push to (origin), and pin every gh call to it.
  const repo = repoFromUrl(tryGit("remote", "get-url", "origin"));
  const visibility = repo && trySh("gh", ["repo", "view", repo, "--json", "visibility", "-q", ".visibility"], { cwd: root });
  if (visibility !== "PRIVATE" && visibility !== "INTERNAL") {
    return log(`handoff: origin ${repo ?? "unparseable"} visibility ${visibility ?? "unknown"} — kept local, no push/PR/comment`);
  }
  // The branch number must be a real open issue (not a PR, not closed): `3-way-merge` must not touch #3's thread.
  // `gh issue view` also answers for PR numbers, so check the URL too.
  const issueState = trySh("gh", ["issue", "view", String(issue), "-R", repo, "--json", "state,url", "-q", '.state + " " + .url'], { cwd: root });
  const [state, url] = (issueState || "").split(" ");
  if (state !== "OPEN" || !/\/issues\/\d+$/.test(url || "")) return log(`handoff: #${issue} is not an open issue (${issueState ?? "missing"}) — skipped`);
  // The session may have ended a while ago (the model call above takes time): only act if HEAD is still this branch.
  const sameBranch = () => tryGit("branch", "--show-current") === branch;
  if (!sameBranch()) return log(`handoff: HEAD moved off ${branch} before the WIP commit — skipped`);

  // WIP commit, but only if nothing in the change looks like a secret.
  const KEEP_OUT = ["--", "."];
  const notes = [];
  const dirty = tryGit("status", "--porcelain");
  if (dirty) {
    // Private index: the person's staging is never touched, and a held-back change leaves no trace.
    const realIndex = resolve(root, git("rev-parse", "--git-path", "index"));
    const tmpIndex = `${realIndex}.harness-${process.pid}`;
    const env = { ...process.env, GIT_INDEX_FILE: tmpIndex };
    const gi = (...a) => trySh("git", a, { cwd: root, env });
    try {
      if (existsSync(realIndex)) copyFileSync(realIndex, tmpIndex);
      gi("add", "-A", ...KEEP_OUT);
      // Fail closed: an unreadable diff, a binary, or a credential-shaped filename holds everything back.
      const diff = gi("diff", "--cached", "HEAD", ...KEEP_OUT);
      // -z --no-renames: raw paths, one per record, no quoting or "a => b" rename forms to parse.
      const numstat = gi("diff", "--cached", "HEAD", "--numstat", "-z", "--no-renames", ...KEEP_OUT);
      const files = (numstat || "").split("\0").filter(Boolean).map((r) => r.split("\t"));
      const reason =
        diff === null || numstat === null ? "the diff could not be read"
        : hasSecret(diff) ? "the diff matched a secret pattern"
        : files.some(([a]) => a === "-") ? "it includes binary files the secret scan cannot read"
        : files.some(([, , f]) => SECRET_FILE_RE.test(f)) ? "it includes a credential-shaped file (.env, key, pem…)"
        : null;
      if (reason) {
        notes.push(`⚠️ Uncommitted changes were **held back on the author's machine**: ${reason}. The author must review and commit them.`);
      } else if (files.length) {
        // [skip ci]: half-done WIP is not worth CI minutes; the next real commit runs CI.
        if (!sameBranch()) {
          notes.push(`⚠️ HEAD moved off \`${branch}\` while the handoff ran. Nothing was committed or pushed.`);
        } else if (gi("commit", "-q", "-m", `wip(#${issue}): session handoff [skip ci]`) === null) {
          notes.push("⚠️ The WIP commit failed (a pre-commit hook?). Changes are still uncommitted on the author's machine.");
        } else {
          tryGit("reset", "-q"); // real index -> new HEAD: everything is committed, nothing left staged
        }
      }
    } finally { rmSync(tmpIndex, { force: true }); }
  }

  // Push the ticket branch and make sure a draft PR exists.
  // Push the named branch, never whatever HEAD is now.
  if (tryGit("push", "-u", "origin", `refs/heads/${branch}:refs/heads/${branch}`) === null) notes.push("⚠️ Push failed — branch may be behind; next session should pull/rebase.");
  // Only an OPEN PR counts: `gh pr view <branch>` would also return an old merged one.
  const pr = trySh("gh", ["pr", "list", "-R", repo, "--head", branch, "--state", "open", "--json", "url", "-q", ".[0].url"], { cwd: root });
  let prUrl = pr;
  if (!pr) {
    const title = trySh("gh", ["issue", "view", String(issue), "-R", repo, "--json", "title", "-q", ".title"], { cwd: root }) || branch;
    prUrl = trySh("gh", ["pr", "create", "-R", repo, "--draft", "--head", branch, "--title", `WIP: ${title} (#${issue})`,
      "--body", `Closes #${issue}\n\nDraft opened automatically at session end. Handoff notes are on the issue.`], { cwd: root });
  }

  const body = `${HANDOFF_MARK}\n## Session handoff — ${author}\nBranch \`${branch}\`${prUrl ? ` · PR ${prUrl}` : ""}\n\n${handoff}\n${notes.length ? "\n" + notes.join("\n") : ""}`;
  sh("gh", ["issue", "comment", String(issue), "-R", repo, "--body", body], { cwd: root });
  log(`handoff posted #${issue} (${branch})`);
}

function writeJournal(root, { journal, title, author, branch, issue }) {
  const project = brainProject(root);
  const repo = brainRepo();
  const bdir = brainDir();
  if (!project || !repo || !existsSync(join(bdir, ".git"))) return log(`journal skip: ${project ?? "repo"} has no brain clone yet`);
  const b = (...a) => trySh("git", a, { cwd: bdir, timeout: 60_000 });
  if (b("fetch", "-q", "origin", "main") === null) return log("journal skip: could not fetch the brain");
  // Linked = projects/<p>/index.md exists as a file on the brain's reviewed main (it only arrives through a PR).
  if (b("cat-file", "-t", `origin/main:projects/${project}/index.md`) !== "blob") return log(`journal skip: ${project} is not linked in the brain`);
  // Never send a private project's notes to a public brain.
  const vis = trySh("gh", ["repo", "view", repo, "--json", "visibility", "-q", ".visibility"]);
  if (vis !== "PRIVATE" && vis !== "INTERNAL") return log(`journal skip: brain repo visibility ${vis ?? "unknown"}`);
  const login = trySh("gh", ["api", "user", "-q", ".login"]);
  if (!login || !/^[A-Za-z0-9-]{1,39}$/.test(login)) return log("journal skip: no gh login");

  const slug = String(title || "session").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "session";
  const sid = String(input.session_id || Date.now()).replace(/[^\w-]/g, "").slice(0, 8) || "session";
  const path = `projects/${project}/journal/${new Date().toISOString().slice(0, 10)}-${slug}-${sid}.md`;
  const yaml = (v) => JSON.stringify(String(v)); // quoted scalar: names/branches can't break the frontmatter
  const text = `---\ntype: journal\nproject: ${yaml(project)}\nauthor: ${yaml(author)}\nbranch: ${yaml(branch)}\n` +
    `${issue ? `issue: ${issue}\n` : ""}date: ${new Date().toISOString()}\n---\n\n${journal}\n`;

  // One commit on top of the brain's main, built in a throwaway index: no checkout, no shared branch, nothing to
  // race with or merge. Its own branch notes/<login>/<session> and its own PR; the gate merges and deletes it.
  const tmp = mkdtempSync(join(tmpdir(), "harness-journal-"));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: join(tmp, "index") };
    const g = (args, input) => trySh("git", args, { cwd: bdir, env, input, timeout: 60_000 });
    const blob = g(["hash-object", "-w", "--stdin"], text);
    const ok = blob && g(["read-tree", "origin/main"]) !== null && g(["update-index", "--add", "--cacheinfo", `100644,${blob},${path}`]) !== null;
    const tree = ok && g(["write-tree"]);
    const commit = tree && g(["commit-tree", tree, "-p", "origin/main", "-m", `journal(${project}): session notes`]);
    if (!commit) return log("journal: could not build the commit");
    const head = `notes/${login}/${sid}`;
    if (b("push", "-q", "origin", `${commit}:refs/heads/${head}`) === null) return log(`journal: push of ${head} failed`);
    // The gate runs on the PR (pull_request_target). Open it with the person's token: GitHub starts no workflow for
    // a PR opened by GITHUB_TOKEN.
    if (trySh("gh", ["pr", "create", "-R", repo, "--base", "main", "--head", head, "--title", `notes: ${project} (${login})`,
      "--body", "Session notes. Merged automatically when the brain gate passes."]) === null) return log(`journal: pushed ${head} but could not open its PR`);
    log(`journal pushed ${path} as ${head}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
