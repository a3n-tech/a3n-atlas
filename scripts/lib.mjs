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
const SECRET_RES = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}/, /\bgithub_pat_[A-Za-z0-9_]{20,}/, /\bsk-[A-Za-z0-9_-]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/, /\bxox[abpors]-[A-Za-z0-9-]{10,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
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

// ---- Central brain: one org repo (default a3n-tech/brain), one folder per project: projects/<repo-name>/.
export function brainRepo() {
  const r = (opt("BRAIN_REPO") || process.env.HARNESS_BRAIN_REPO || "a3n-tech/brain").trim();
  return /^[\w.-]+\/[\w.-]+$/.test(r) ? r : null;
}
export const brainDir = () => opt("BRAIN_DIR") || process.env.HARNESS_BRAIN_DIR || join(dataDir(), "brain");
/** Project folder name in the central brain: the GitHub repo name. Never the brain repo itself. */
export function brainProject(root) {
  const repo = repoFromUrl(trySh("git", ["remote", "get-url", "origin"], { cwd: root }));
  const [owner, name] = repo?.split("/") ?? [];
  const brain = brainRepo();
  // Same org as the brain only: a clone of someone-else/<name> must not read or write the team's projects/<name>/.
  const sameOrg = brain && owner?.toLowerCase() === brain.split("/")[0].toLowerCase();
  return sameOrg && name && /^[A-Za-z0-9._-]+$/.test(name) && !name.startsWith(".") && repo.toLowerCase() !== brain.toLowerCase() ? name : null;
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
