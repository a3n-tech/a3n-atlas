// Run: node skills/seam/scripts/check-plan-drift.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, chmodSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { referencedIssues } from "./check-plan-drift.mjs";

const script = resolve(import.meta.dirname, "check-plan-drift.mjs");

// range parsing
const nums = (text) => { const p = []; const r = referencedIssues([["a.md", text]], p); return [[...r.keys()].sort((x, y) => x - y), p]; };
assert.deepEqual(nums("see #5 – #8")[0], [5, 6, 7, 8]);
let [k, p] = nums("#1 – #999999999");
assert.deepEqual(k, [1, 999999999]);
assert.equal(p.length, 1);
[k, p] = nums("#5 - #200 and #9 – #3");
assert.deepEqual(k, [3, 5, 9, 200]); // prose hyphen is not a range; endpoints still count
assert.equal(p.length, 1); // descending range refused

// fail-closed gh handling, via a PATH shim
const base = process.env.DRIFT_TMP || mkdtempSync(join(tmpdir(), "drift-"));
function run(ghBody) {
  const dir = join(base, String(Math.random()).slice(2));
  mkdirSync(join(dir, "bin"), { recursive: true });
  mkdirSync(join(dir, "repo/.paul"), { recursive: true });
  writeFileSync(join(dir, "repo/.paul/PLAN.md"), "Closes #7\n");
  writeFileSync(join(dir, "bin/gh"), `#!/bin/sh\n${ghBody}\n`);
  chmodSync(join(dir, "bin/gh"), 0o755);
  return spawnSync("node", [script], { cwd: join(dir, "repo"), encoding: "utf8", env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}`, PLAN_ROLE_PREFIX: "" } });
}
const shim = (view) => `case "$2" in list) echo '[]';; view) ${view};; esac`;

let r = run(shim(`echo "HTTP 403: API rate limit exceeded" >&2; exit 1`));
assert.equal(r.status, 2);
assert.match(r.stderr, /could not read issue #7.*rate limit/);

r = run(shim(`echo "GraphQL: Could not resolve to an Issue with the number of 7." >&2; exit 1`));
assert.equal(r.status, 0); // genuinely missing: not drift

r = run(shim(`echo '{"state":"OPEN","title":"t"}'`));
assert.equal(r.status, 1);
assert.match(r.stderr, /premature/);

r = run(`case "$2" in list) python3 -c 'import json;print(json.dumps([{"number":i,"title":"t","labels":[]} for i in range(500)]))';; esac`);
assert.equal(r.status, 2);
assert.match(r.stderr, /fetch limit/);

console.log("ok");
