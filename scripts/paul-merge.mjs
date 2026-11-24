// git merge driver for .paul/** and brain/**: `node paul-merge.mjs %O %A %B %P`.
// Asks Claude to merge both sides' intent. Writes the result to %A and exits 0.
// On any doubt exits 1, which leaves a normal conflict for /a3ntech:sync.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { claude, hasSecret, log, CONFLICT_RE } from "./lib.mjs";

const [base, ours, theirs, path] = process.argv.slice(2);
const read = (f) => (f && existsSync(f) ? readFileSync(f, "utf8") : "");
const [O, A, B] = [read(base), read(ours), read(theirs)];

if (A === B || B === O) process.exit(0);           // nothing to merge
if (A === O) { writeFileSync(ours, B); process.exit(0); } // only they changed

try {
  let merged = claude(`Three-way merge of a project planning/notes file (${path}). Two teammates edited it concurrently.
Produce the merged file that keeps BOTH sides' changes. Rules:
- Keep every decision, issue reference (#N), log entry and table row from both sides; drop exact duplicates.
- For single-value fields (current position, status, last activity, progress, next action) take the most recent/advanced value; if unclear, keep OURS and note THEIRS on the next line.
- Keep the file's structure, frontmatter, headings and links exactly.
- Output ONLY the merged file content. No code fence, no commentary.

=== BASE ===
${O}
=== OURS ===
${A}
=== THEIRS ===
${B}
=== END ===`, "sonnet", 240_000);
  merged = merged.replace(/^```[a-z]*\n/, "").replace(/\n```\s*$/, "") + "\n";
  const tooShort = merged.length < 0.6 * Math.min(A.length, B.length);
  if (!merged.trim() || CONFLICT_RE.test(merged) || tooShort || (hasSecret(merged) && !hasSecret(A + B))) {
    log(`merge-driver rejected output for ${path}`);
    process.exit(1);
  }
  writeFileSync(ours, merged.replace(/\n+$/, "\n"));
  log(`merge-driver merged ${path}`);
  process.exit(0);
} catch (e) {
  log(`merge-driver failed for ${path}: ${e.message}`);
  process.exit(1);
}
