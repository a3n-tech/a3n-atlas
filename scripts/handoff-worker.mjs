// Detached from SessionEnd. Turns the session into team-visible context:
//   ticket branch -> WIP commit (if secret-scan clean) + push + draft PR + AI handoff comment
//   any branch    -> AI journal note in .paul/journal/ (one file per session: never conflicts)
// Never touches the default branch's history.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { sh, trySh, issueFromBranch, hasSecret, redact, claude, log, HANDOFF_MARK, isHarnessRepo, SECRET_FILE_RE, repoFromUrl } from "./lib.mjs";

const payloadFile = process.argv[2];
let input;
try { input = JSON.parse(readFileSync(payloadFile, "utf8")); } finally { try { rmSync(payloadFile); } catch {} }

try { await main(); } catch (e) { log(`handoff error: ${e.message}`); }

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
Return ONLY a JSON object, no prose, no code fence:
{"handoff": "<markdown with sections ### Done, ### In progress, ### Next step, ### Blockers / open questions — short bullets, file paths where useful>",
 "journal": "<markdown: decisions made, conventions agreed, gotchas learned that OTHER teammates need. Empty string if none>",
 "title": "<3-6 word kebab-case slug for the journal file>"}
Never include secrets, tokens, passwords, emails or personal data. No mention of AI or Claude.

Branch: ${branch} ${issue ? `(ticket #${issue})` : ""}
Diff stat:\n${diffStat}\n\nTRANSCRIPT:\n${transcript}`);
  const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  const handoff = redact(json.handoff || "");
  const journal = redact(json.journal || "");

  // Journal: one file per session, so concurrent teammates never conflict on it.
  let journalPath = null;
  const brainJournal = existsSync(join(root, "brain")) ? join(root, "brain", "journal") : null;
  if (journal.trim() && (brainJournal || existsSync(join(root, ".paul")))) {
    const dir = brainJournal || join(root, ".paul", "journal");
    mkdirSync(dir, { recursive: true });
    const slug = String(json.title || "session").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "session";
    journalPath = join(dir, `${new Date().toISOString().slice(0, 10)}-${slug}-${String(input.session_id || "").slice(0, 8)}.md`);
    writeFileSync(journalPath, `---\ntype: journal\nauthor: ${author}\nbranch: ${branch}\n${issue ? `issue: ${issue}\n` : ""}date: ${new Date().toISOString()}\n---\n\n${journal}\n`);
  }

  if (!issue) {
    // Not a ticket branch: keep the note; commit it alone on a feature branch, never on default.
    if (journalPath && branch && branch !== defBranch) {
      tryGit("add", journalPath);
      tryGit("commit", "-m", "docs(journal): session notes", "--", journalPath);
    }
    return log(`handoff: journal only (${branch})`);
  }

  // Outward actions (push, PR, comment) only for private/internal repos: a WIP diff or a
  // session summary must never land somewhere public.
  // Check the repo we will actually push to (origin), and pin every gh call to it.
  const repo = repoFromUrl(tryGit("remote", "get-url", "origin"));
  const visibility = repo && trySh("gh", ["repo", "view", repo, "--json", "visibility", "-q", ".visibility"], { cwd: root });
  if (visibility !== "PRIVATE" && visibility !== "INTERNAL") {
    return log(`handoff: origin ${repo ?? "unparseable"} visibility ${visibility ?? "unknown"} — kept local, no push/PR/comment`);
  }

  // WIP commit, but only if nothing in the change looks like a secret.
  const notes = [];
  const dirty = tryGit("status", "--porcelain");
  if (dirty) {
    tryGit("add", "-A", "--intent-to-add");
    // Fail closed: an unreadable diff, a binary, or a credential-shaped filename holds everything back.
    const diff = tryGit("diff", "HEAD");
    // -z --no-renames: raw paths, one per record, no quoting or "a => b" rename forms to parse.
    const numstat = tryGit("diff", "HEAD", "--numstat", "-z", "--no-renames");
    const files = (numstat || "").split("\0").filter(Boolean).map((r) => r.split("\t"));
    const reason =
      diff === null || numstat === null ? "the diff could not be read"
      : hasSecret(diff) ? "the diff matched a secret pattern"
      : files.some(([a]) => a === "-") ? "it includes binary files the secret scan cannot read"
      : files.some(([, , f]) => SECRET_FILE_RE.test(f)) ? "it includes a credential-shaped file (.env, key, pem…)"
      : null;
    if (reason) {
      tryGit("reset", "-q");
      if (journalPath) { tryGit("add", journalPath); tryGit("commit", "-m", `docs(journal): session notes (#${issue})`, "--", journalPath); }
      notes.push(`⚠️ Uncommitted changes were **held back on the author's machine**: ${reason}. The author must review and commit them.`);
    } else {
      git("add", "-A");
      git("commit", "-m", `wip(#${issue}): session handoff`);
    }
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
