// Detached from SessionEnd. Turns the session into team-visible context:
//   ticket branch -> WIP commit (if secret-scan clean) + push + draft PR + AI handoff comment
//   any branch    -> AI journal note in the central brain: projects/<repo>/journal/ (one file per session)
// Never touches the default branch's history, never commits during a merge/rebase, never changes the
// person's staging (the scan and commit use a private index).
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, statSync, openSync, closeSync, copyFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { sh, trySh, issueFromBranch, hasSecret, redact, claude, log, HANDOFF_MARK, isHarnessRepo, SECRET_FILE_RE, repoFromUrl,
  gitOperationInProgress, parseSections, brainDir, brainProject, brainRepo } from "./lib.mjs";

const payloadFile = process.argv[2];
let input;
try { input = JSON.parse(readFileSync(payloadFile, "utf8")); } finally { try { rmSync(dirname(payloadFile), { recursive: true }); } catch {} }

// One worker per repo at a time: two sessions ending together would race on the index and the push.
let lock = null;
try {
  const root = trySh("git", ["rev-parse", "--show-toplevel"], { cwd: input.cwd });
  const gitDir = root && trySh("git", ["rev-parse", "--git-dir"], { cwd: root });
  if (gitDir) {
    lock = resolve(root, gitDir, "harness-handoff.lock");
    try { if (Date.now() - statSync(lock).mtimeMs > 15 * 60_000) rmSync(lock); } catch {}
    closeSync(openSync(lock, "wx"));
  }
} catch { log(`handoff skip: another handoff is running in ${input.cwd}`); process.exit(0); }
try { await main(); } catch (e) { log(`handoff error: ${e.message}`); } finally { if (lock) rmSync(lock, { force: true }); }


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
  const issueState = trySh("gh", ["issue", "view", String(issue), "-R", repo, "--json", "state", "-q", ".state"], { cwd: root });
  if (issueState !== "OPEN") return log(`handoff: #${issue} is not an open issue (${issueState ?? "missing"}) — skipped`);

  // WIP commit, but only if nothing in the change looks like a secret.
  // graphify-out/ is rebuilt by CI on main; a PR that carries it conflicts with every other PR.
  const KEEP_OUT = ["--", ".", ":(exclude)graphify-out"];
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
        if (gi("commit", "-q", "-m", `wip(#${issue}): session handoff [skip ci]`) === null) {
          notes.push("⚠️ The WIP commit failed (a pre-commit hook?). Changes are still uncommitted on the author's machine.");
        } else {
          tryGit("reset", "-q"); // real index -> new HEAD: everything is committed, nothing left staged
        }
      }
    } finally { rmSync(tmpIndex, { force: true }); }
  }

  // Push the ticket branch and make sure a draft PR exists.
  if (tryGit("push", "-u", "origin", "HEAD") === null) notes.push("⚠️ Push failed — branch may be behind; next session should pull/rebase.");
  const pr = trySh("gh", ["pr", "view", branch, "-R", repo, "--json", "url", "-q", ".url"], { cwd: root });
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
  const bdir = brainDir();
  const pdir = project && join(bdir, "projects", project);
  if (!pdir || !existsSync(pdir)) return log(`journal skip: ${project ?? "repo"} not linked in the central brain`);
  const b = (...a) => trySh("git", a, { cwd: bdir, timeout: 60_000 });
  const login = trySh("gh", ["api", "user", "-q", ".login"]);
  if (!login || b("branch", "--show-current") !== `notes/${login}`) return log("journal skip: brain clone not on notes/<login> (brain-pull fixes it next session)");
  // Never send a private project's notes to a public brain.
  const vis = trySh("gh", ["repo", "view", brainRepo(), "--json", "visibility", "-q", ".visibility"]);
  if (vis !== "PRIVATE" && vis !== "INTERNAL") return log(`journal skip: brain repo visibility ${vis ?? "unknown"}`);
  const dir = join(pdir, "journal");
  mkdirSync(dir, { recursive: true });
  const slug = String(title || "session").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "session";
  const file = join(dir, `${new Date().toISOString().slice(0, 10)}-${slug}-${String(input.session_id || "").replace(/[^\w-]/g, "").slice(0, 8)}.md`);
  const yaml = (v) => JSON.stringify(String(v)); // quoted scalar: names/branches can't break the frontmatter
  writeFileSync(file, `---\ntype: journal\nproject: ${yaml(project)}\nauthor: ${yaml(author)}\nbranch: ${yaml(branch)}\n` +
    `${issue ? `issue: ${issue}\n` : ""}date: ${new Date().toISOString()}\n---\n\n${journal}\n`);
  b("add", "--", file);
  if (b("commit", "-q", "-m", `journal(${project}): session notes`, "--", file) === null) return log("journal: commit failed");
  // Remote may be ahead (another machine pushed): merge it, retry once.
  if (b("push", "-q", "origin", `notes/${login}`) === null) {
    b("fetch", "-q", "origin");
    b("merge", "-q", "--no-edit", `origin/notes/${login}`);
    if (b("push", "-q", "origin", `notes/${login}`) === null) return log("journal: push failed; it goes out with the next push");
  }
  // The brain's gate runs on a PR (pull_request_target). Open it with the person's token: GitHub starts no
  // workflow for a PR opened by GITHUB_TOKEN. One PR per person stays open; later pushes update it.
  const repo = brainRepo();
  const open = trySh("gh", ["pr", "list", "-R", repo, "--head", `notes/${login}`, "--state", "open", "--json", "number", "-q", ".[0].number"]);
  if (!open && trySh("gh", ["pr", "create", "-R", repo, "--base", "main", "--head", `notes/${login}`,
    "--title", `notes: ${login}`, "--body", "Session notes. Merged automatically when the brain gate passes."]) === null) log("journal: could not open the notes PR");
  log(`journal pushed ${project} ${file}`);
}
