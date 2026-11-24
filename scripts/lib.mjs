// Shared helpers for the harness hooks. No dependencies: node + git + gh + claude.
import { execFileSync, execFile } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, existsSync, openSync, writeSync, closeSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

export function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, ...opts }).trim();
}
export function trySh(cmd, args, opts = {}) {
  try { return sh(cmd, args, opts); } catch { return null; }
}
/** Async trySh, so independent gh calls can run in parallel inside a hook's time budget. */
export function trySpawn(cmd, args, opts = {}) {
  return new Promise((res) => execFile(cmd, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, ...opts },
    (err, out) => res(err ? null : out.trim())));
}

/** Issue number from a ticket branch: `12-login`, `issue-12`, `feat/12-login`, `feature/12-x`, `gh-12_x`.
 *  Only conventional prefixes count, so `hotfix/500-error` or `release/2026-11` are not tickets.
 *  Callers still confirm the number is an open issue (not a PR) before acting on it. */
const BRANCH_TYPES = "feat|feature|fix|bugfix|chore|docs|refactor|test|perf|ci|build|style|task|story";
export function issueFromBranch(branch) {
  const m = new RegExp(`^(?:(?:${BRANCH_TYPES})\\/)?(?:issue-|gh-)?(\\d{1,6})(?:[-_]|$)`).exec(branch || "");
  return m && Number(m[1]) > 0 ? Number(m[1]) : null;
}

/** A merge, rebase, cherry-pick, revert or bisect is in progress: never commit on top of it. */
export function gitOperationInProgress(root) {
  for (const p of ["MERGE_HEAD", "rebase-merge", "rebase-apply", "CHERRY_PICK_HEAD", "REVERT_HEAD", "BISECT_LOG"]) {
    const path = trySh("git", ["rev-parse", "--git-path", p], { cwd: root });
    if (path && existsSync(resolve(root, path))) return p; // worktrees return absolute paths
  }
  return trySh("git", ["diff", "--name-only", "--diff-filter=U"], { cwd: root }) ? "unmerged files" : null;
}

// shortcut: regex scan only, catches common token shapes; upgrade to gitleaks if the team adopts it.
// Keep in sync with the pattern in skills/brain/central/scripts/gate.sh (bash there, so it cannot import this).
const SECRET_RES = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}/, /\bgithub_pat_[A-Za-z0-9_]{20,}/, /\bsk-[A-Za-z0-9_-]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/, /\bsk_(?:live|test)_[A-Za-z0-9]{10,}/, /\bxox[abpors]-[A-Za-z0-9-]{10,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAIza[0-9A-Za-z_-]{35}\b/, /\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["']?[^\s"']{8,}/i,
];
export const SECRET_FILE_RE = /(^|\/)(\.env(\..*)?|.*\.(pem|key|p12|pfx|jks|keystore)|id_(rsa|ed25519|ecdsa)|credentials(\.json)?|\.npmrc|\.netrc)$/i;
export const hasSecret = (text) => SECRET_RES.some((r) => r.test(text || ""));
export const redact = (text) =>
  SECRET_RES.reduce((t, r) => t.replace(new RegExp(r.source, r.flags.includes("g") ? r.flags : r.flags + "g"), "****"), text || "");

/** Headless Claude with plugins/hooks off (no recursion), no tools, prompt on stdin. */
export function claude(prompt, model = "haiku", timeout = 180_000) {
  return sh("claude", ["-p", "--safe-mode", "--model", model, "--tools", "", "--no-session-persistence"],
    { input: prompt, timeout, env: { ...process.env, HARNESS_CHILD: "1" }, maxBuffer: 20 * 1024 * 1024 });
}

export const dataDir = () => process.env.CLAUDE_PLUGIN_DATA || join(homedir(), ".claude", "harness");

export function log(msg) {
  const dir = dataDir();
  try { mkdirSync(dir, { recursive: true }); appendFileSync(join(dir, "harness.log"), `${new Date().toISOString()} ${msg}\n`); } catch {}
}

export async function readStdinJson() {
  let s = ""; for await (const c of process.stdin) s += c;
  try { return JSON.parse(s); } catch { return {}; }
}

export const HANDOFF_MARK = "<!-- harness:handoff -->";
export const CONFLICT_RE = /^(<{7}|>{7})( |$)/m;

/** Hooks act only in repos that adopted the harness (team rules block in CLAUDE.md). */
export function isHarnessRepo(root) {
  try { return readFileSync(join(root, "CLAUDE.md"), "utf8").includes("<!-- harness:team-rules:start"); } catch { return false; }
}

/** owner/name from a GitHub remote URL (https or ssh); null if it isn't one. */
export function repoFromUrl(url) {
  const m = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec((url || "").trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

export const ROLES = ["pmo", "pm", "architect", "frontend", "backend", "fullstack", "devops", "release", "qa"];
export const configDir = () => process.env.HARNESS_CONFIG_DIR || join(homedir(), ".config", "a3n-harness");
export const rolesFile = () => join(configDir(), "roles");
/** Personal lenses live only on that person's machine: <config>/lenses/<name>.md. */
export const personalLens = (name) => join(configDir(), "lenses", `${name}.md`);

/** This person's roles (per machine, never committed). Team roles, or a personal lens that exists
 *  on this machine; anything else is dropped. Names are [a-z0-9-] only, so no path tricks. */
export function readRoles(file = rolesFile()) {
  try {
    return [...new Set(readFileSync(file, "utf8").split(/[\s,]+/).map((r) => r.trim().toLowerCase())
      .filter((r) => /^[a-z0-9-]{1,32}$/.test(r) && (ROLES.includes(r) || existsSync(personalLens(r)))))];
  } catch { return []; }
}

// ---- Plugin options (userConfig in plugin.json; Claude Code exports them as CLAUDE_PLUGIN_OPTION_<KEY>).
const opt = (k) => process.env[`CLAUDE_PLUGIN_OPTION_${k}`];
/** Session-end handoff: on unless the person turned it off (plugin option, or legacy HARNESS_HANDOFF=off). */
export const handoffEnabled = () => !/^(false|off|0|no)$/i.test(opt("HANDOFF") ?? "") && process.env.HARNESS_HANDOFF !== "off";

// ---- Brain: one repo of markdown notes (the brain store), one folder per project.
/** owner/name of this repo's origin on GitHub, or null. */
export const originRepo = (root) => repoFromUrl(trySh("git", ["remote", "get-url", "origin"], { cwd: root }));
/** The brain repo for a project repo. Declared in its committed CLAUDE.md as `<!-- atlas:brain owner/name -->` (outside
 *  the managed rules block, so setup never overwrites it; changing it goes through that repo's PR review). No
 *  declaration means `<owner>/brain` for the project repo's owner. Never a personal setting. */
// owner/name segments start with a letter or digit, so "." and ".." can never become path segments.
export const REPO_RE = /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/;
const BRAIN_MARK = /^<!--\s*atlas:brain\s+(\S+)\s*-->\s*$/m;
export function brainRepo(root) {
  if (!root) return null;
  // Read the declaration from the remote default branch (reviewed content), never the working tree: checking out an
  // unreviewed branch must not be able to point this repo's journals and context at another brain.
  const def = trySh("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], { cwd: root }) || "origin/main";
  const declared = BRAIN_MARK.exec(trySh("git", ["show", `${def}:CLAUDE.md`], { cwd: root }) || "")?.[1];
  if (declared) return REPO_RE.test(declared) ? declared : null;
  const owner = originRepo(root)?.split("/")[0];
  return owner ? `${owner}/brain` : null;
}
/** Folder that holds one clone per brain: <base>/<owner>/<name>. Separate clones, so one brain can never stand in
 *  for another. */
export const brainBase = () => opt("BRAIN_DIR") || process.env.HARNESS_BRAIN_DIR || join(dataDir(), "brains");
export const brainDir = (repo) => join(brainBase(), ...repo.toLowerCase().split("/"));
export const PRIVATE_STAMP = "atlas-private"; // written into the clone's .git by brain-pull after a visibility check
/** The local clone of `repo`, only if its configured origin really is `repo` and brain-pull last saw it private or
 *  internal. Anything else (no clone, another remote, a public brain) returns null and nothing is read or written. */
export function brainClone(repo) {
  if (!repo) return null;
  const dir = brainDir(repo);
  if (!existsSync(join(dir, ".git", PRIVATE_STAMP))) return null;
  // Raw config value, not `remote get-url`: insteadOf rewrites must not change which repo this claims to be.
  const origin = repoFromUrl(trySh("git", ["config", "--get", "remote.origin.url"], { cwd: dir }));
  return origin && origin.toLowerCase() === repo.toLowerCase() ? dir : null;
}
/** Private or internal on GitHub (gh). Anything else, including an error, is treated as public. */
export const isPrivateRepo = (repo, opts = {}) =>
  ["PRIVATE", "INTERNAL"].includes(trySh("gh", ["repo", "view", repo, "--json", "visibility", "-q", ".visibility"], opts));
/** Folder name for this repo in the brain: the GitHub repo name. Never the brain repo itself. */
export function brainProject(root) {
  const repo = originRepo(root);
  const name = repo?.split("/")[1];
  const brain = brainRepo(root);
  return name && /^[A-Za-z0-9._-]+$/.test(name) && !name.startsWith(".") && repo.toLowerCase() !== brain?.toLowerCase() ? name : null;
}
/** `repo: owner/name` from a hub's frontmatter, or null. */
export function hubRepo(text) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text || "")?.[1] || "";
  const m = /^repo:\s*["']?(\S+?)["']?\s*$/m.exec(fm);
  return m && REPO_RE.test(m[1]) ? m[1] : null;
}
/** The project's hub text from the brain's reviewed main, only if this repo is linked there: projects/<name>/index.md
 *  exists as a file (it only arrives through a reviewed PR) and its `repo:` is exactly this repo's owner/name. That
 *  match is what stops a clone of someone-else/<name> from reading or writing the team's projects/<name>/. */
export function linkedHub(root, bdir) {
  const name = brainProject(root);
  if (!name || !existsSync(join(bdir, ".git"))) return null;
  const g = (...a) => trySh("git", a, { cwd: bdir, timeout: 5_000 });
  const path = `origin/main:projects/${name}/index.md`;
  if (g("cat-file", "-t", path) !== "blob") return null;
  const text = g("show", path);
  return hubRepo(text)?.toLowerCase() === originRepo(root)?.toLowerCase() ? { name, text } : null;
}

/** Model output as three delimited sections (not JSON: one raw newline in a JSON string loses the whole handoff). */
export function parseSections(raw) {
  const get = (name) => (new RegExp(`^=== ${name} ===\\s*$([\\s\\S]*?)(?=^=== [A-Z]+ ===\\s*$|(?![\\s\\S]))`, "m").exec(raw || "")?.[1] || "").trim();
  return { handoff: get("HANDOFF"), journal: get("JOURNAL"), title: get("TITLE") };
}

/** Exclusive lock file holding our pid. A lock whose pid is gone is stale and taken over. Waits up to
 *  waitMs (polling), so a second session end queues behind the first instead of being dropped.
 *  Returns a release function, or null if the lock stayed busy. */
export function acquireLock(path, waitMs = 0) {
  const until = Date.now() + waitMs;
  for (;;) {
    try {
      const fd = openSync(path, "wx");
      writeSync(fd, String(process.pid)); closeSync(fd);
      return () => { try { if (readFileSync(path, "utf8") === String(process.pid)) rmSync(path); } catch {} };
    } catch {
      let pid = 0; try { pid = Number(readFileSync(path, "utf8")); } catch {}
      let alive = false; try { if (pid) { process.kill(pid, 0); alive = true; } } catch (e) { alive = e.code === "EPERM"; }
      if (!alive) { try { if (Number(readFileSync(path, "utf8")) === pid) rmSync(path); } catch {} continue; }
      if (Date.now() >= until) return null;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
    }
  }
}
