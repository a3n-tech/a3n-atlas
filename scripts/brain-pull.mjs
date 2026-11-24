// Detached from SessionStart: keep this machine's clone of the central brain current.
//   missing  -> clone it
//   present  -> fetch, switch to notes/<login>, merge our remote branch and main in
// Never blocks a session: the next session reads whatever is on disk.
import { existsSync, mkdirSync, openSync, closeSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { trySh, log, brainRepo, brainDir, dataDir } from "./lib.mjs";

const repo = brainRepo();
const dir = brainDir();
if (!repo) process.exit(log("brain-pull: invalid brain repo option"));

// One pull at a time per machine (several sessions can start together).
mkdirSync(dataDir(), { recursive: true });
const lock = join(dataDir(), "brain-pull.lock");
try { if (Date.now() - statSync(lock).mtimeMs > 10 * 60_000) rmSync(lock); } catch {}
let fd; try { fd = openSync(lock, "wx"); } catch { process.exit(0); }
try { main(); } catch (e) { log(`brain-pull error: ${e.message}`); } finally { closeSync(fd); rmSync(lock, { force: true }); }

function main() {
  const git = (...a) => trySh("git", a, { cwd: dir, timeout: 120_000 });
  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(dirname(dir), { recursive: true });
    const ok = trySh("git", ["clone", "-q", `https://github.com/${repo}.git`, dir], { timeout: 300_000 });
    return log(ok === null ? `brain-pull: clone of ${repo} failed (access? run gh auth setup-git)` : `brain-pull: cloned ${repo}`);
  }
  if (git("fetch", "-q", "--prune", "origin") === null) return log("brain-pull: fetch failed");

  // AI merge driver for the brain's markdown (.gitattributes: *.md merge=paul-ai).
  const driver = `node "${join(dirname(fileURLToPath(import.meta.url)), "paul-merge.mjs")}" %O %A %B %P`;
  if (git("config", "merge.paul-ai.driver") !== driver) {
    git("config", "merge.paul-ai.name", "harness AI merge for notes");
    git("config", "merge.paul-ai.driver", driver);
  }

  const login = trySh("gh", ["api", "user", "-q", ".login"], { timeout: 15_000 });
  if (!login || !/^[A-Za-z0-9-]{1,39}$/.test(login)) return log("brain-pull: no gh login");
  const branch = `notes/${login}`;
  if (git("branch", "--show-current") !== branch) {
    if (git("status", "--porcelain")) return log(`brain-pull: ${dir} has local edits, not switching to ${branch}`);
    if (git("switch", "-q", branch) === null && git("switch", "-q", "-c", branch, "origin/main") === null)
      return log(`brain-pull: cannot switch to ${branch}`);
  }
  const merge = (ref) => {
    if (!git("rev-parse", "--verify", "-q", ref)) return;
    if (git("-c", "user.name=brain-bot", "-c", "user.email=brain-bot@users.noreply.github.com",
      "merge", "-q", "--no-edit", ref) === null) { git("merge", "--abort"); log(`brain-pull: merge of ${ref} stopped (local edits or conflict)`); }
  };
  merge(`origin/${branch}`);
  merge("origin/main");
  log(`brain-pull: ${repo} up to date on ${branch}`);
}
