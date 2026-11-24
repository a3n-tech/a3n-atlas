// Detached from SessionStart: keep this machine's clone of the central brain current.
//   missing  -> clone it (gh repo clone: follows the person's git protocol, https or ssh)
//   present  -> fetch and fast-forward main
// The clone is read-only for Atlas: it stays on main and is only fast-forwarded. Journals are written as their own
// commits on the remote (see handoff-worker.mjs), so nothing local ever needs merging.
// Never blocks a session: the next session reads whatever is on disk.
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { trySh, log, brainRepo, brainDir, dataDir, acquireLock } from "./lib.mjs";

const repo = brainRepo();
const dir = brainDir();
if (!repo) process.exit(log("brain-pull: invalid brain repo option"));

// One pull at a time per machine (several sessions can start together).
mkdirSync(dataDir(), { recursive: true });
const release = acquireLock(join(dataDir(), "brain-pull.lock"));
if (!release) process.exit(0);
try { main(); } catch (e) { log(`brain-pull error: ${e.message}`); } finally { release(); }

function main() {
  const git = (...a) => trySh("git", a, { cwd: dir, timeout: 300_000 });
  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(dirname(dir), { recursive: true });
    const ok = trySh("gh", ["repo", "clone", repo, dir, "--", "-q"], { timeout: 600_000 })
      ?? trySh("git", ["clone", "-q", `https://github.com/${repo}.git`, dir], { timeout: 600_000 });
    if (ok === null) return log(`brain-pull: clone of ${repo} failed (access? run gh auth setup-git or check SSH)`);
    log(`brain-pull: cloned ${repo}`);
  }
  if (git("fetch", "-q", "--prune", "origin") === null) return log("brain-pull: fetch failed");
  if (git("branch", "--show-current") !== "main") {
    // A clone the person also edits by hand (brain_dir option) may be on another branch: leave it alone.
    // Session start reads hubs from origin/main either way.
    return log(`brain-pull: ${dir} is not on main; fetched only`);
  }
  if (git("merge", "-q", "--ff-only", "origin/main") === null) log(`brain-pull: ${dir} has local changes; fetched only`);
  else log(`brain-pull: ${repo} up to date`);
}
