// Detached from SessionStart: keep this machine's clone of one brain current.
//   node brain-pull.mjs <owner/name>
//   missing  -> clone it (gh repo clone: follows the person's git protocol, https or ssh)
//   present  -> fetch and fast-forward main
// Each brain has its own clone (<base>/<owner>/<name>). The clone is read-only for Atlas: it stays on main and is
// only fast-forwarded; journals are written as their own commits on the remote (see handoff-worker.mjs).
// The clone is stamped as usable only after GitHub confirms the brain is private or internal; a brain that is
// public, or whose origin is not the repo asked for, loses the stamp and is never read or written.
// Never blocks a session: the next session reads whatever is on disk.
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { trySh, log, brainDir, dataDir, acquireLock, repoFromUrl, isPrivateRepo, PRIVATE_STAMP } from "./lib.mjs";

const repo = process.argv[2];
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) process.exit(log(`brain-pull: invalid brain repo ${JSON.stringify(repo)}`));
const dir = brainDir(repo);

// One pull per brain at a time (several sessions can start together).
mkdirSync(dataDir(), { recursive: true });
const release = acquireLock(join(dataDir(), `brain-pull-${repo.replace("/", "--")}.lock`));
if (!release) process.exit(0);
try { main(); } catch (e) { log(`brain-pull error: ${e.message}`); } finally { release(); }

function main() {
  const stamp = join(dir, ".git", PRIVATE_STAMP);
  const unstamp = (why) => { rmSync(stamp, { force: true }); log(`brain-pull: ${repo} not used: ${why}`); };
  if (!isPrivateRepo(repo)) {
    if (existsSync(join(dir, ".git"))) unstamp("not private or internal (or not reachable)");
    else log(`brain-pull: ${repo} is not a reachable private brain; not cloned`);
    return;
  }
  const git = (...a) => trySh("git", a, { cwd: dir, timeout: 300_000 });
  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(dirname(dir), { recursive: true });
    const ok = trySh("gh", ["repo", "clone", repo, dir, "--", "-q"], { timeout: 600_000 })
      ?? trySh("git", ["clone", "-q", `https://github.com/${repo}.git`, dir], { timeout: 600_000 });
    if (ok === null) return log(`brain-pull: clone of ${repo} failed (access? run gh auth setup-git or check SSH)`);
    log(`brain-pull: cloned ${repo}`);
  }
  const origin = repoFromUrl(git("config", "--get", "remote.origin.url"));
  if (origin?.toLowerCase() !== repo.toLowerCase()) return unstamp(`clone at ${dir} points at ${origin ?? "an unknown remote"}`);
  writeFileSync(stamp, `${new Date().toISOString()}\n`);
  if (git("fetch", "-q", "--prune", "origin") === null) return log(`brain-pull: fetch of ${repo} failed`);
  if (git("branch", "--show-current") !== "main") return log(`brain-pull: ${dir} is not on main; fetched only`);
  if (git("merge", "-q", "--ff-only", "origin/main") === null) log(`brain-pull: ${dir} has local changes; fetched only`);
  else log(`brain-pull: ${repo} up to date`);
}
