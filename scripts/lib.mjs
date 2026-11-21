// Shared helpers for the harness hooks. No dependencies: node + git + gh + claude.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, ...opts }).trim();
}
export function trySh(cmd, args, opts = {}) {
  try { return sh(cmd, args, opts); } catch { return null; }
}

/** Issue number from a ticket branch: `12-login`, `issue-12`, `feat/12-login`, `gh-12_x`. */
export function issueFromBranch(branch) {
  const m = /(?:^|\/)(?:issue-|gh-)?(\d+)(?:[-_]|$)/.exec(branch || "");
  return m ? Number(m[1]) : null;
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

export function log(msg) {
  const dir = process.env.CLAUDE_PLUGIN_DATA || join(homedir(), ".claude", "harness");
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
