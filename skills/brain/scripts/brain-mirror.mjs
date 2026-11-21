#!/usr/bin/env node
// Refreshes the read-only mirrors in brain/ so Obsidian (which hides dot-folders)
// and agents see the plan and the tickets next to the rest of the project context.
//   .paul/*.md        -> brain/plan/*.md
//   GitHub issues     -> brain/tickets/index.md   (needs `gh`; skipped without it)
// Never edit the mirrors: the originals are the source of truth. Writes only on change.
// Run by CI (brain-mirror.yml) and safe to run locally: `node scripts/brain-mirror.mjs`.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BRAIN = "brain";
const PLAN_FILES = ["PROJECT", "ROADMAP", "STATE", "SPECIAL-FLOWS"];
const changed = [];

function writeIfChanged(path, text) {
  if (existsSync(path) && readFileSync(path, "utf8") === text) return;
  writeFileSync(path, text);
  changed.push(path);
}
const stripFrontmatter = (s) => s.replace(/^---\n[\s\S]*?\n---\n+/, "");
// Ticket titles are user input: keep tables intact and render no HTML.
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/</g, "&lt;").replace(/\r?\n/g, " ");

if (!existsSync(BRAIN)) {
  console.error("brain-mirror: no brain/ here. Run /harness:brain first.");
  process.exit(2);
}

// 1. Plan mirror.
mkdirSync(join(BRAIN, "plan"), { recursive: true });
for (const name of PLAN_FILES) {
  const src = join(".paul", `${name}.md`);
  if (!existsSync(src)) continue;
  writeIfChanged(join(BRAIN, "plan", `${name}.md`),
    `---\ntype: generated\nsource: ".paul/${name}.md"\n---\n\n` +
    `> [!warning] Generated mirror of \`.paul/${name}.md\` — do not edit here. Edit the original through PAUL.\n\n` +
    stripFrontmatter(readFileSync(src, "utf8")));
}

// 2. Tickets mirror.
let issues = null;
try {
  issues = JSON.parse(execFileSync("gh", ["issue", "list", "--state", "open", "--limit", "500",
    "--json", "number,title,labels,assignees,url,updatedAt"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
} catch {
  console.log("brain-mirror: gh unavailable — tickets mirror skipped.");
}
if (issues) {
  const groups = [["ready-for-agent", "Ready for agents"], ["ready-for-human", "Needs a person"],
    ["needs-triage", "Needs triage"], ["needs-info", "Waiting for info"]];
  const seen = new Set();
  let md = "---\ntype: generated\nsource: GitHub issues\n---\n\n" +
    "> [!warning] Generated from GitHub issues — do not edit here. Edit the issue on GitHub.\n\n# Open tickets\n";
  const table = (rows) => rows.length
    ? "| # | Title | Assignee | Updated |\n|---|---|---|---|\n" + rows.map((i) =>
        `| [#${i.number}](${i.url}) | ${cell(i.title)} | ${cell(i.assignees.map((a) => a.login).join(", ") || "—")} | ${i.updatedAt.slice(0, 10)} |`).join("\n") + "\n"
    : "_None._\n";
  for (const [label, heading] of groups) {
    const rows = issues.filter((i) => !seen.has(i.number) && i.labels.some((l) => l.name === label));
    rows.forEach((i) => seen.add(i.number));
    md += `\n## ${heading} (\`${label}\`)\n\n${table(rows)}`;
  }
  md += `\n## Other\n\n${table(issues.filter((i) => !seen.has(i.number)))}`;
  mkdirSync(join(BRAIN, "tickets"), { recursive: true });
  writeIfChanged(join(BRAIN, "tickets", "index.md"), md);
}

console.log(changed.length ? `brain-mirror: updated ${changed.join(", ")}` : "brain-mirror: up to date");
