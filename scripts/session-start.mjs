// SessionStart: register the AI merge driver for this clone, surface unresolved
// conflicts for AI resolution, and inject the latest handoff for the ticket branch.
import { existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { trySh, issueFromBranch, readStdinJson, HANDOFF_MARK, log, isHarnessRepo } from "./lib.mjs";

if (process.env.HARNESS_CHILD) process.exit(0);
const input = await readStdinJson();
const cwd = input.cwd || process.cwd();
const root = trySh("git", ["rev-parse", "--show-toplevel"], { cwd });
if (!root || !isHarnessRepo(root)) process.exit(0);
const git = (...a) => trySh("git", a, { cwd: root });
const out = [];

// 1. AI merge driver, per clone (git config is not committed, so every clone needs this).
const driver = `node "${join(dirname(fileURLToPath(import.meta.url)), "paul-merge.mjs")}" %O %A %B %P`;
if (existsSync(join(root, ".paul")) && git("config", "merge.paul-ai.driver") !== driver) {
  git("config", "merge.paul-ai.name", "harness AI merge for .paul/");
  git("config", "merge.paul-ai.driver", driver);
}

// 2. Conflicts the driver could not settle (or code conflicts): hand them to the AI now.
const conflicted = git("diff", "--name-only", "--diff-filter=U");
if (conflicted) {
  out.push(`## Unresolved merge conflicts\nThese files have conflicts: ${conflicted.split("\n").join(", ")}.\n` +
    "Before any other work, run /harness:sync to resolve them. Do not ask the person to resolve them by hand.");
}

// 3. Ticket handoff from the last session on this branch (any teammate).
const branch = git("branch", "--show-current");
const issue = issueFromBranch(branch);
if (issue) {
  const raw = trySh("gh", ["issue", "view", String(issue), "--json", "title,state,comments"], { cwd: root, timeout: 10_000 });
  if (raw) {
    const { title, state, comments } = JSON.parse(raw);
    const last = [...comments].reverse().find((c) => c.body.includes(HANDOFF_MARK));
    out.push(`## Ticket #${issue}: ${title} (${state})\nBranch \`${branch}\`. ` +
      (last ? `Latest handoff (${last.author?.login}, ${last.createdAt}):\n\n${last.body.replace(HANDOFF_MARK, "").trim().slice(0, 4000)}`
            : "No handoff yet — read the issue body first."));
  }
}

// 4. Team journal: point at it, don't inline it (token cost).
const jdir = join(root, ".paul", "journal");
if (existsSync(jdir)) {
  const recent = readdirSync(jdir).filter((f) => f.endsWith(".md")).sort().slice(-5);
  if (recent.length) out.push(`## Team journal\nRecent session notes in .paul/journal/: ${recent.join(", ")}. Read them when the task touches the same area.`);
  const uncommitted = git("status", "--porcelain", "--", ".paul/journal");
  if (uncommitted) out.push("Uncommitted journal notes exist in .paul/journal/ — include them in the next commit on a ticket branch.");
}

if (out.length) {
  log(`session-start ${root} issue=${issue ?? "-"} conflicts=${conflicted ? "yes" : "no"}`);
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: out.join("\n\n") } }));
}
