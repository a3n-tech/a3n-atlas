---
name: seam
description: Wire PAUL (milestones/phases) to the mattpocock engineering skills (GitHub tickets, TDD, review) so the two planning systems never disagree — writes the Execution Seam into .paul/SPECIAL-FLOWS.md, the agent summary into docs/agents/domain.md, installs the check:plan drift checker, creates triage labels, and verifies. Use this after /harness:setup or /paul:init, or whenever someone says set up paul + matt, wire the planning stack, connect phases to tickets, add check:plan, or when check:plan reports orphan/premature drift. Not for creating tickets (/to-tickets) or planning a phase (/paul:plan).
---

# PAUL + mattpocock seam

Writes three things into the current repo: `.paul/SPECIAL-FLOWS.md` (Execution Seam), `docs/agents/domain.md`,
and `scripts/check-plan-drift.mjs`.

**PAUL owns the horizon (milestone → phase). The engineering skills own the slice
(ticket → red/green → diff).** The setup writes that contract down twice — once for each
toolchain — and installs one script that checks the two rules that actually drift.

Every step is idempotent: detect first, write only what is missing, never duplicate a section.

## 1. Preconditions — check, don't assume

Run from the repo root:

```bash
git rev-parse --show-toplevel; git remote -v; gh auth status
ls .paul docs/agents 2>/dev/null; ls package.json Makefile 2>/dev/null
```

| Missing | Do |
|---|---|
| Not a git repo / no GitHub remote | Stop. The seam needs an issue tracker. Ask the user. |
| `.paul/` | PAUL not initialised. Tell the user to run `/paul:init` first (it is conversational), then re-run this skill. |
| `docs/agents/` (issue-tracker, triage-labels, domain) | Tell the user to run `/mattpocock-skills:setup-matt-pocock-skills` — it is **user-only**, you cannot invoke it. Re-run this skill after. |
| `gh` unauthenticated | Ask the user to run `! gh auth login`. |

Any row missing → tell the user what to run and **stop**; don't half-install.
All present → continue. Read `.paul/SPECIAL-FLOWS.md`,
`.paul/MILESTONES.md`, `.paul/ROADMAP.md`, `.paul/STATE.md`, and `docs/agents/domain.md` in
full before editing any of them.

## 2. Decide the three project values

Settle from the repo; ask only if genuinely ambiguous.

- **`{{TRACKER}}`** — from `docs/agents/issue-tracker.md` (usually `GitHub`).
- **`{{OWNER_DOC}}`** — where owner-only work lives (credentials, dashboards, DNS). Use an
  existing go-live/launch doc if there is one. If none exists,
  use `docs/GO-LIVE.md` and create it with a single `## 1. Owner-only` heading — do not invent
  items to fill it.
- **`{{CHECK_CMD}}`** — `npm run check:plan` if `package.json` exists; else
  `make check-plan` if a `Makefile` exists; else `node scripts/check-plan-drift.mjs`.

## 3. Write the Execution Seam into `.paul/SPECIAL-FLOWS.md`

Skip if any heading starting `## Execution Seam` already exists (report it; offer a diff against the
template instead of overwriting).

Otherwise insert [templates/execution-seam.md](templates/execution-seam.md) immediately
before the next `## ` heading after "Project-Level Dependencies" (or at the end if that
section is absent), substituting the three values. Adapt the template to the repo: drop any
file it names that `.paul/` doesn't have (`ledger.toml`, `paul.toml`).

Build `{{MAPPING_ROWS}}` from reality:

```bash
gh issue list --state all --limit 200 --json number,title,state,labels,body
```

An issue maps to a PAUL unit only on an **explicit** link: `.paul/` already cites its number,
or its title/body/labels name the phase or milestone. A thematic resemblance is not a link —
list those issues for the user as "possibly Phase X?" and leave them unmapped.
**Never fabricate issue numbers.**

Rows: one per unit with linked issues (`| Phase 2 Checkout | #14 – #19 |`), then **always** a
final owner row: `| Human-only setup ({{OWNER_DOC}}) | <ready-for-human issue numbers, or none yet> |`. If no
unit has issues yet, the owner row follows a single `| (none yet) | — |`.

Add an Amendment History row: `| <today> | Execution Seam added | PAUL + mattpocock setup |`.

## 4. Write the agent-facing summary into `docs/agents/domain.md`

Skip if `## Two planning systems` already exists. Otherwise append
[templates/domain-section.md](templates/domain-section.md) with values substituted.

While there, check `domain.md` tells agents where domain knowledge **actually** lives in this
repo (architecture doc, `.paul/`, single sources of truth). If it points at files that
don't exist (e.g. "read CONTEXT.md" with no `CONTEXT.md`), **replace** that line with a
"Before exploring, read these" list of real files — a false instruction left in place is a
bug. Use the
project's own vocabulary; do **not** copy another project's terms or constraints.

## 5. Install the drift checker

```bash
mkdir -p scripts
cp "${CLAUDE_SKILL_DIR}/scripts/check-plan-drift.mjs" scripts/
```

If `scripts/check-plan-drift.mjs` exists and differs, show the diff and ask before replacing.

Wire `{{CHECK_CMD}}`:
- `package.json` → add `"check:plan": "node scripts/check-plan-drift.mjs"` to `scripts`
  (edit the JSON, keep key order/formatting).
- `Makefile` → add a `check-plan:` target.
- The script reads `docs/GO-LIVE.md` by default as the owner doc. If `{{OWNER_DOC}}` is
  anything else, set it in the command:
  `PLAN_EXTRA_DOCS=<path> node scripts/check-plan-drift.mjs`.

What it checks (read-only, exits 1 on drift):
1. **orphan** — an open `ready-for-agent` issue that no file under `.paul/` (or the owner
   doc) references. Work the roadmap cannot see.
2. **premature** — a plan line saying `closes #N` / `delivered in #N` / `resolved by #N` /
   `shipped in #N` / `completed by #N` while `#N` is still open.

Ranges like `#5 – #18` count as references.

## 6. Ensure the triage labels exist

The checker keys on `ready-for-agent`; `/triage` needs all five roles. Read the label
strings (right column) and meanings from `docs/agents/triage-labels.md`, then create every
one that's missing, using the Meaning column as the description:

```bash
gh label list --limit 200 --json name --jq '.[].name'
gh label create needs-info --description "Waiting on reporter for more information"
```

If the agent-ready label isn't literally `ready-for-agent`, set `PLAN_AGENT_LABEL=<name>`
in the check command.

## 7. Point the root agent doc at the seam

In `AGENTS.md` (or `CLAUDE.md` if there is no `AGENTS.md`), at the end of the
`## Agent skills` section the mattpocock setup wrote (or at the end of the file if there is
none), add this block if no `### Planning stack` heading exists:

```markdown
### Planning stack

PAUL owns milestones/phases; the engineering skills own tickets. Contract:
`.paul/SPECIAL-FLOWS.md` → "Execution Seam". Drift check: `{{CHECK_CMD}}`.
```

If the README lists npm scripts/commands, or the root agent doc says to keep docs current,
add `check:plan` to those lists too, in the same change.

## 8. Verify — then report

```bash
{{CHECK_CMD}}
```

- Exit 0 → sanity-check the count. "N issue reference(s)" should roughly equal the issues
  in your mapping rows plus any `.paul/` already cited. A count that comes only from
  template prose means a fake reference slipped in — find and remove it.
- Orphans → each is a real finding, not a bug in the setup. Either add the issue to a
  mapping row (if it belongs to a phase) or tell the user it needs a phase. Do not silence
  the check by adding issue numbers to an unrelated row.
- Premature → reopen the phase wording or close the issue; ask the user which.

Also confirm no placeholders are left and each section appears exactly once:

```bash
grep -rnE '\{\{[A-Z_]+\}\}' .paul docs/agents $(ls AGENTS.md CLAUDE.md 2>/dev/null) || echo clean
grep -c '^## Execution Seam' .paul/SPECIAL-FLOWS.md   # 1
grep -c '^## Two planning systems' docs/agents/domain.md   # 1
```

Report in a few lines: files written/skipped, labels created, mapping rows, check result.
Do not commit unless asked; if asked, one commit, message
`chore(plan): wire PAUL and the engineering skills together`.

## Optional

- **CI gate:** add a job running `{{CHECK_CMD}}` with `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`
  and `issues: read` permission. Offer it; don't add it unasked.

## Don'ts

- Don't run `/to-spec` or `/grill-with-docs` on anything already in `MILESTONES.md`.
- File human-only work as `ready-for-human` issues (one per account/credential/registration/decision), never `ready-for-agent`; never write a secret into one.
- Don't copy another project's content (its domain rules, vocabulary, phase table).
