#!/usr/bin/env node
// Detects drift between PAUL's plan and the GitHub issue tracker.
//
// Two planning systems run in this repo (see .paul/SPECIAL-FLOWS.md, "Execution
// Seam"). They only stay honest if something checks the two rules that keep
// them from diverging:
//
//   1. A phase marked complete must have no open linked issues.
//   2. Every open ready-for-agent issue must be claimed by some PAUL unit,
//      otherwise work exists that the roadmap does not know about.
//
// Read-only. Needs `gh` authenticated. Exits non-zero on drift so it can gate a
// build; run it by hand with `npm run check:plan`.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const PAUL_DIR = ".paul";
const LABEL = process.env.PLAN_AGENT_LABEL || "ready-for-agent";
// Docs outside .paul/ that also map PAUL units to issues (the owner/go-live doc).
// Override with PLAN_EXTRA_DOCS="docs/A.md,docs/B.md".
const EXTRA_DOCS = (process.env.PLAN_EXTRA_DOCS || "docs/GO-LIVE.md").split(",").map((s) => s.trim()).filter(Boolean);

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Every .md/.toml under .paul/, which is where a phase records its issue links. */
function paulDocs() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(md|toml)$/.test(e.name)) out.push([p, readFileSync(p, "utf8")]);
    }
  };
  if (existsSync(PAUL_DIR)) walk(PAUL_DIR);
  for (const f of EXTRA_DOCS) if (existsSync(f)) out.push([f, readFileSync(f, "utf8")]);
  return out;
}

/** Issue numbers referenced anywhere in the plan, including `#5 – #18` ranges. */
function referencedIssues(docs) {
  const refs = new Map(); // number -> file that mentions it
  for (const [file, text] of docs) {
    for (const m of text.matchAll(/#(\d+)\s*[–-]\s*#(\d+)/g)) {
      const [a, b] = [Number(m[1]), Number(m[2])];
      for (let n = Math.min(a, b); n <= Math.max(a, b); n++) if (!refs.has(n)) refs.set(n, file);
    }
    for (const m of text.matchAll(/#(\d+)\b/g)) {
      const n = Number(m[1]);
      if (!refs.has(n)) refs.set(n, file);
    }
  }
  return refs;
}

function openAgentIssues() {
  const raw = sh("gh", ["issue", "list", "--state", "open", "--label", LABEL,
                        "--limit", "200", "--json", "number,title"]);
  return JSON.parse(raw);
}

// An *explicit* claim that an issue is finished. Deliberately narrow.
//
// The first version flagged any line containing "done" or "complete" near a
// "#N". That fired immediately on a true sentence — "Partial (b, d, e, f, g
// done); the remainder is #7" — where the completion word described something
// else entirely. A check that cries wolf on correct prose gets switched off, so
// it now requires the issue to be named as the thing that was completed.
const CLOSES = /\b(closes|closed by|completed by|delivered in|resolved by|shipped in)\s+#(\d+)\b/gi;

function completedPhaseIssues(docs) {
  const bad = [];
  for (const [file, text] of docs) {
    for (const line of text.split("\n")) {
      for (const m of line.matchAll(CLOSES)) {
        bad.push({ file, line: line.trim(), issue: Number(m[2]) });
      }
    }
  }
  return bad;
}

function issueState(n) {
  try {
    return JSON.parse(sh("gh", ["issue", "view", String(n), "--json", "state,title"]));
  } catch {
    return null; // not an issue (a PR, or does not exist)
  }
}

if (!existsSync(PAUL_DIR)) {
  console.error(`plan drift: no ${PAUL_DIR}/ here. Run from the repo root of a PAUL project.`);
  process.exit(2);
}
try {
  sh("gh", ["auth", "status"]);
} catch {
  console.error("plan drift: `gh` is missing or not authenticated. Run `gh auth login`.");
  process.exit(2);
}

const docs = paulDocs();
const refs = referencedIssues(docs);
const problems = [];

// Rule 0: an unresolved merge in the plan. The AI merge driver should have
// resolved it; if markers survive, the plan is unreadable for every teammate.
for (const [file, text] of docs) {
  if (/^(<{7}|>{7})( |$)/m.test(text)) {
    problems.push(`conflict: ${file} has unresolved merge markers. Run /harness:sync to resolve them.`);
  }
}

// Rule 2: open agent-ready work the plan never mentions.
for (const issue of openAgentIssues()) {
  if (!refs.has(issue.number)) {
    problems.push(
      `orphan: issue #${issue.number} "${issue.title}" is open and ${LABEL}, but no PAUL unit claims it.\n` +
      `        Link it from a phase, or close it. Work the roadmap cannot see does not get sequenced.`,
    );
  }
}

// Rule 1: a phase claiming completion while its issue is still open.
for (const { file, line, issue } of completedPhaseIssues(docs)) {
  const st = issueState(issue);
  if (st && st.state === "OPEN") {
    problems.push(
      `premature: ${file} marks work complete while #${issue} "${st.title}" is still open.\n` +
      `        State follows the tracker — reopen the phase or close the issue.\n` +
      `        ${line}`,
    );
  }
}

if (problems.length === 0) {
  console.log(`plan drift: none. ${refs.size} issue reference(s) across ${docs.length} plan file(s).`);
  process.exit(0);
}

console.error(`plan drift: ${problems.length} problem(s)\n`);
for (const p of problems) console.error(`  - ${p}\n`);
console.error("See .paul/SPECIAL-FLOWS.md, \"Execution Seam\".");
process.exit(1);
