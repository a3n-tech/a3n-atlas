---
name: setup
description: Onboard a repo or a teammate onto Atlas, the a3n-tech agentic team toolkit. Installs PAUL and graphify, pins the repo-level plugins (ponytail, caveman, claude-code-skills) in .claude/settings.json, writes the team rules into CLAUDE.md, wires the AI merge driver, links the repo to the central brain, reviews CI cost, then walks through /paul:init and /a3ntech:seam. Use this whenever someone says set up / initialize / install Atlas (or the harness), onboard this repo, get me set up on this project, start a new team repo, or when a repo has no .paul/ or no team rules block in CLAUDE.md, even if they never say "Atlas". Not for planning a phase (/paul:plan) or toggling a single plugin.
---

# Atlas setup

One command to bring a repo (and a teammate) onto Atlas. Every step is
idempotent: detect first, write only what is missing, report what was skipped.

Files this skill ships: `${CLAUDE_SKILL_DIR}/project-settings.json`,
`${CLAUDE_SKILL_DIR}/team-rules.md`.

## 1. Preconditions

```bash
git rev-parse --show-toplevel && git remote -v && gh auth status
```

- Not a git repo, or no GitHub remote → stop and ask. Atlas needs GitHub issues.
- `gh` not authenticated → ask the person to run `! gh auth login`, then continue.

Never print token values from `gh auth status`; mask them.

## 2. PAUL (machine-level, per teammate)

```bash
ls ~/.claude/commands/paul .claude/commands/paul 2>/dev/null
```

Missing → tell the person it installs PAUL globally into `~/.claude/`, then run:

```bash
npx -y paul-framework@1.4.0 --global
```

PAUL commands load on the next session. If you just installed it, say so: the person must
restart Claude Code before `/paul:*` works.

### Graphify (token saver — query a code graph instead of re-reading files)

```bash
which graphify && ls ~/.claude/skills/graphify/SKILL.md 2>/dev/null
```

Missing → tell the person it installs a Python CLI and a global skill, then run (prefer `uv`, fall back to `pipx`):

```bash
uv tool install graphifyy==0.9.108 || pipx install graphifyy==0.9.108
graphify install --platform claude
```

Then wire it into the repo (idempotent; each command appends rather than replaces):

```bash
graphify hook install     # post-commit/merge/checkout rebuild + graph.json merge driver
graphify claude install   # CLAUDE.md section: query the graph before reading files
```

`graphify claude install` writes hooks into `.claude/settings.json` with the installer's
**absolute** binary path (leaks a username, breaks on other machines). Always normalize after it:

```bash
sed -i.bak -E 's#"/[^"]*/graphify hook-guard#"graphify hook-guard#' .claude/settings.json && rm -f .claude/settings.json.bak .claude/settings.json.graphify-bak
grep -n '"/Users/\|"/home/' .claude/settings.json && echo "STOP: absolute path left" || true
```

The graph is **shared**: `graphify-out/` is committed (remove any bare `graphify-out/` line
from `.gitignore`), except machine-local files and the HTML viewer (it renders labels from repo content
unescaped — a stored-XSS risk if shared) — ensure `.gitignore` has:

```
graphify-out/cache/
graphify-out/.graphify_build_state.json
graphify-out/.graphify_labels.pending.json
graphify-out/graph.html
```
 Copy `${CLAUDE_SKILL_DIR}/ci/graphify-refresh.yml` to
`.github/workflows/` so `main` keeps a fresh graph even when a teammate commits without graphify
installed. Code is rebuilt by AST — no LLM, no key. If the repo has no graph yet, run
`graphify update .` once and commit it.

## 3. Pin the team plugins (repo-level, committed)

Merge `${CLAUDE_SKILL_DIR}/project-settings.json` into `.claude/settings.json`:

- File missing → copy it.
- File exists → read it, add only missing keys under `extraKnownMarketplaces` and
  `enabledPlugins`. Never drop or change existing keys. Keep formatting.
- One exception, the rename to Atlas: replace an `enabledPlugins` key `harness` + `@a3n-tech` with
  `a3ntech@a3n-tech`, and set the `a3n-tech` marketplace `repo` to `a3n-tech/atlas`. Say so in the report.

This pins the repo-level tools: the token savers `ponytail` (smallest working change) and
`caveman` (terse output), plus `claude-code-skills`. `enabledPlugins` does not install anything.
Each person installs Atlas once (below); `mattpocock-skills` and `superpowers` come with it as
dependencies.

Person-level install, if the teammate has not done it (needs Claude Code 2.1.324+):

```bash
gh auth login && gh auth setup-git    # the marketplace is private; or use an SSH key
claude plugin marketplace add a3n-tech/atlas
claude plugin install a3ntech@a3n-tech
```

Updates: `claude plugin update a3ntech@a3n-tech`, or turn on auto-update for the marketplace in `/plugin`.

Third-party marketplaces (ponytail, caveman, claude-code-skills) are **pinned to reviewed commits** via `ref` (full SHA;
needs Claude Code 2.1.324+). Keep the pins from the template. Bumping a pin is a deliberate PR to
`a3n-tech/atlas`: review the upstream diff of its hooks (network calls, exec, file access) first.

Never write to `.claude/settings.local.json` — that is personal and not committed.

## 4. Team rules (repo-level, committed)

Target: `CLAUDE.md` at the repo root (create it with a `# <repo name>` heading if missing).

- Contains `<!-- harness:team-rules:start` → replace everything between the start and
  `<!-- harness:team-rules:end -->` markers with the current `team-rules.md` (this is how
  rule updates roll out). Show the diff first if it changes anything.
- Otherwise → append `team-rules.md` at the end.

Never edit content outside the markers.

## 4a. README instructions (repo-level, committed)

Every team repo's `README.md` carries the full how-to for the harness, so a new teammate can
follow it without asking anyone. Same marker rule as the team rules:

- Contains `<!-- harness:readme:start` → replace everything between the start and
  `<!-- harness:readme:end -->` markers with `${CLAUDE_SKILL_DIR}/readme-section.md`.
- Otherwise → append it at the end (create `README.md` with a `# <repo name>` heading if missing).

Never edit the project's own README content outside the markers.

## 4b. Collaboration automation (repo-level, committed)

Ensure `.gitattributes` contains (append missing lines, never duplicate):

```
.paul/** merge=paul-ai
```

The session-start hook registers the `paul-ai` driver in each clone automatically; it asks
Claude to merge both sides of a `.paul/` conflict and falls back to `/a3ntech:sync`.

Session-end posts ticket handoffs to the issue and writes the session journal to the central brain.

Tell the person once, plainly: on a ticket branch, ending a session **commits WIP, pushes the
branch, opens a draft PR and comments a handoff on the issue**. Ticket branches are `<N>-slug`,
`issue-<N>`, `gh-<N>` or `<type>/<N>-slug` (type is feat, fix, chore, docs, refactor, test, perf,
ci, build or style), and the issue must exist and be open. Nothing happens during a merge, rebase
or cherry-pick, WIP commits carry `[skip ci]`, the person's staging is never changed, and a diff
that matches a secret pattern is held back, not pushed. Opt out per person with the `handoff`
option (`/config` or `claude plugin configure a3ntech@a3n-tech`); legacy `HARNESS_HANDOFF=off` still works.

## 4b1. CI budget

The org has 2000 Actions minutes a month. Measured in November: CI on every agent draft PR was
about 48% of minutes, an `issues:`-triggered drift check about 14%, and a 15-minute cron would cost
about 2880 minutes a month on its own. Review `.github/workflows/*` and propose these changes. Apply
them only with the person's OK, and never change a deploy workflow without asking.

- Skip draft PRs: `pull_request: types: [opened, synchronize, reopened, ready_for_review]` and on
  the job `if: github.event.pull_request.draft == false`.
- Cancel superseded runs: `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`.
- `paths-ignore: ['graphify-out/**', '**/*.md']` where docs do not affect the build.
- `timeout-minutes` on every job.
- Never `issues:` triggers.
- Schedules no more often than every 6 hours.
- Cache package installs.

Report the estimated minutes saved per workflow.

## 4b2. Roles

Create the nine `role:<id>` labels (see `/a3ntech:role`, "Tickets by role") if missing. Then put the routing
rules where the ticket skills read them: in `docs/agents/triage-labels.md`, replace the block between
`<!-- harness:role-labels:start` and `<!-- harness:role-labels:end -->` with
`${CLAUDE_SKILL_DIR}/../role/role-labels.md` (append it if the markers are missing). Same for Jira or any
other tracker — the labels are the concept; `docs/agents/issue-tracker.md` says how to apply them. Then ask the person
which role(s) they hold and run `/a3ntech:role` — roles are per machine, never committed.

## 4c. Central brain

Link the repo to the central brain with `/a3ntech:brain`. It creates `projects/<repo-name>/` in
`a3n-tech/brain` (bootstrapping the brain repo if the org has none yet) and migrates any old
per-repo `brain/` folder. Do not copy brain workflows into the project repo.

## 5. Hand off — the steps only a person can run

Check each and list only what is still missing, in this order:

| Missing | Who runs it | Why |
|---|---|---|
| `.paul/PROJECT.md` | `/paul:init` (you can run it; it is conversational — ask its questions one at a time) | PAUL needs the project brief before the seam |
| `docs/agents/issue-tracker.md` | the **person** runs `/mattpocock-skills:setup-matt-pocock-skills` — it is user-only | the seam reads tracker + triage labels from it |
| `## Execution Seam` in `.paul/SPECIAL-FLOWS.md` | `/a3ntech:seam` | wires PAUL ↔ tickets and installs `check:plan` |

If `.paul/PROJECT.md` is missing, start `/paul:init` now. Stop before the user-only step and
tell the person exactly what to type.

## 6. Report

A few lines: what was installed, what was written or skipped, what the person must do next
(one action). Do not commit unless asked. If asked, one commit:
`chore: adopt Atlas`. No AI attribution in the message.
