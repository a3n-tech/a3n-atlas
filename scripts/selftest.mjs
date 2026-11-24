// node scripts/selftest.mjs — pure-logic checks, no network.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync as rf, existsSync as ex } from "node:fs";
import { mkdirSync as mk } from "node:fs";
import { execFileSync as x } from "node:child_process";
import { issueFromBranch, hasSecret, redact, CONFLICT_RE, isHarnessRepo, SECRET_FILE_RE, repoFromUrl, readRoles, ROLES, parseSections, gitOperationInProgress, handoffEnabled, brainProject, brainRepo, hubRepo, hasBlockers, projectRef } from "./lib.mjs";

assert.equal(issueFromBranch("12-login-form"), 12);
assert.equal(issueFromBranch("feat/34-checkout"), 34);
assert.equal(issueFromBranch("issue-7"), 7);
assert.equal(issueFromBranch("gh-9_x"), 9);
assert.equal(issueFromBranch("main"), null);
assert.equal(issueFromBranch("feat/plan"), null);
assert.equal(issueFromBranch("v2-release"), null);
assert.ok(hasSecret("token = " + "ghp_" + "a".repeat(36)));
assert.ok(hasSecret("AKIA" + "ABCDEFGHIJKLMNOP"));
assert.ok(!hasSecret("Closes #12, see docs/GO-LIVE.md"));
assert.ok(!redact("key sk-" + "x".repeat(30)).includes("xxxx"));
assert.ok(CONFLICT_RE.test("a\n<<<<<<< HEAD\nb"));
assert.ok(!CONFLICT_RE.test("a <<<<<<< inline"));
console.log("selftest ok");
const d = mkdtempSync(join(tmpdir(), "hx-"));
assert.ok(!isHarnessRepo(d));
writeFileSync(join(d, "CLAUDE.md"), "x\n<!-- harness:team-rules:start — managed -->\n");
assert.ok(isHarnessRepo(d));
for (const f of [".env", "app/.env.local", "certs/server.pem", "id_rsa", "credentials.json", ".npmrc"]) assert.ok(SECRET_FILE_RE.test(f), f);
for (const f of ["src/env.ts", "keyboard.tsx", "docs/credentials-guide.md", "README.md"]) assert.ok(!SECRET_FILE_RE.test(f), f);
console.log("gate ok");
assert.equal(repoFromUrl("https://github.com/a3n-tech/dhaka-topi-events.git"), "a3n-tech/dhaka-topi-events");
assert.equal(repoFromUrl("git@github.com:a3n-tech/harness.git"), "a3n-tech/harness");
assert.equal(repoFromUrl("https://gitlab.com/x/y.git"), null);
assert.equal(repoFromUrl(null), null);
console.log("repo ok");
const rf2 = join(d, "roles"); writeFileSync(rf2, "Frontend, qa\nnope  backend frontend");
assert.deepEqual(readRoles(rf2), ["frontend", "qa", "backend"]);
assert.deepEqual(readRoles(join(d, "missing")), []);
for (const r of ROLES) assert.ok(ex(new URL(`../roles/${r}.md`, import.meta.url)), `lens ${r}`);
console.log("roles ok");
process.env.HARNESS_CONFIG_DIR = d; mk(join(d, "lenses"), { recursive: true });
writeFileSync(join(d, "lenses", "lead.md"), "# lead");
writeFileSync(rf2, "lead ../etc/passwd ghost frontend");
assert.deepEqual(readRoles(rf2), ["lead", "frontend"]);   // personal lens kept, traversal + unknown dropped
console.log("personal lens ok");
// Branch parsing: only conventional prefixes are tickets.
for (const b of ["hotfix/500-error", "release/2026-11", "renovate/node-18", "v2-release", "0-zero"]) assert.equal(issueFromBranch(b), null, b);
assert.equal(issueFromBranch("fix/7_crash"), 7);
assert.equal(issueFromBranch("feature/42-login"), 42);
assert.equal(issueFromBranch("bugfix/9-x"), 9);
assert.deepEqual(parseSections("noise\n=== HANDOFF ===\n- a \"q\"\n=== JOURNAL ===\n\n=== TITLE ===\nslug\n"),
  { handoff: '- a "q"', journal: "", title: "slug" });
assert.deepEqual(parseSections("garbage"), { handoff: "", journal: "", title: "" });
for (const [v, on] of [[undefined, true], ["true", true], ["false", false], ["off", false]]) {
  if (v === undefined) delete process.env.CLAUDE_PLUGIN_OPTION_HANDOFF; else process.env.CLAUDE_PLUGIN_OPTION_HANDOFF = v;
  assert.equal(handoffEnabled(), on, `handoff=${v}`);
}
delete process.env.CLAUDE_PLUGIN_OPTION_HANDOFF;
console.log("parse/options ok");
// Merge in progress is detected; project name comes from origin.
const g = (...a) => x("git", a, { cwd: d, stdio: "pipe" });
g("init", "-q", "-b", "main"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
writeFileSync(join(d, "f"), "a\n"); g("add", "f"); g("commit", "-qm", "a");
assert.equal(gitOperationInProgress(d), null);
g("checkout", "-qb", "o"); writeFileSync(join(d, "f"), "o\n"); g("commit", "-qam", "o");
g("checkout", "-q", "main"); writeFileSync(join(d, "f"), "m\n"); g("commit", "-qam", "m");
try { g("merge", "o"); } catch {}
assert.equal(gitOperationInProgress(d), "MERGE_HEAD");
g("remote", "add", "origin", "git@github.com:a3n-tech/shop-api.git");
assert.equal(brainProject(d), "shop-api");
assert.equal(brainRepo(d), "a3n-tech/brain"); // default brain: <owner>/brain of the project repo
// The declaration counts only on the remote default branch (reviewed), never from the working tree.
writeFileSync(join(d, "CLAUDE.md"), "x\n<!-- atlas:brain other-org/team-brain -->\n");
assert.equal(brainRepo(d), "a3n-tech/brain"); // working tree only: ignored
g("merge", "--abort"); g("add", "CLAUDE.md"); g("commit", "-qm", "declare"); g("update-ref", "refs/remotes/origin/main", "HEAD");
assert.equal(brainRepo(d), "other-org/team-brain"); // on origin/main: used
writeFileSync(join(d, "CLAUDE.md"), "x\n<!-- atlas:brain ../.. -->\n"); g("commit", "-qam", "bad"); g("update-ref", "refs/remotes/origin/main", "HEAD");
assert.equal(brainRepo(d), null); // "." and ".." segments are rejected
writeFileSync(join(d, "CLAUDE.md"), "x\n"); g("commit", "-qam", "plain"); g("update-ref", "refs/remotes/origin/main", "HEAD");
assert.equal(hubRepo("---\nrepo: ../x\n---"), null);
// Linking is checked by the hub's `repo:` line (linkedHub), so a same-name repo elsewhere maps to a folder name only.
assert.equal(hubRepo("---\ntype: project-hub\nrepo: a3n-tech/shop-api\n---\n# x"), "a3n-tech/shop-api");
assert.equal(hubRepo("---\nrepo: REPLACE-WITH-OWNER/REPO-NAME\n---"), "REPLACE-WITH-OWNER/REPO-NAME");
assert.equal(hubRepo("# no frontmatter\nrepo: a/b"), null);
g("remote", "set-url", "origin", "https://github.com/a3n-tech/brain.git");
assert.equal(brainProject(d), null); // the brain repo is not a project of itself
console.log("git state ok");

// Blockers in a handoff decide Blocked vs In progress on the team board.
assert.equal(hasBlockers("### Done\n- x\n### Blockers / open questions\n- waiting on API key from ops\n"), true);
assert.equal(hasBlockers("### Done\n- x\n### Blockers / open questions\n- None\n"), false);
assert.equal(hasBlockers("### Done\n- x\n"), false);
g("checkout", "-q", "main"); writeFileSync(join(d, "CLAUDE.md"), "x\n<!-- atlas:project acme/7 -->\n"); g("commit", "-qam", "project"); g("update-ref", "refs/remotes/origin/main", "HEAD");
assert.deepEqual(projectRef(d), { owner: "acme", number: "7" });
console.log("visibility ok");
