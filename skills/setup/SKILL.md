---
name: setup
description: Onboard a repo or a teammate onto Atlas, the a3n-tech agentic team toolkit. Installs PAUL, pins the repo-level plugins (ponytail, caveman) in .claude/settings.json, writes the team rules into CLAUDE.md, wires the AI merge driver, links the repo to the brain, reviews CI cost, then walks through /paul:init and /a3ntech:seam. Use this whenever someone says set up / initialize / install Atlas (or the harness), onboard this repo, get me set up on this project, start a new team repo, or when a repo has no .paul/ or no team rules block in CLAUDE.md, even if they never say "Atlas". Not for planning a phase (/paul:plan) or toggling a single plugin.
---

# Atlas setup

One command to bring a repo (and a teammate) onto Atlas. Every step is
idempotent: detect first, write only what is missing, report what was skipped.

Files this skill ships: `${CLAUDE_SKILL_DIR}/project-settings.json`,
`${CLAUDE_SKILL_DIR}/team-rules.md`, `${CLAUDE_SKILL_DIR}/readme-section.md`, `${CLAUDE_SKILL_DIR}/harness-setup.md`.

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

## 3. Pin the team plugins (repo-level, committed)

Merge `${CLAUDE_SKILL_DIR}/project-settings.json` into `.claude/settings.json`:

- File missing → copy it.
- File exists → read it, add only missing keys under `extraKnownMarketplaces` and
  `enabledPlugins`. Never drop or change existing keys. Keep formatting.
- One exception, the rename to Atlas: replace an `enabledPlugins` key `harness` + `@a3n-tech` with
  `a3ntech@a3n-tech`, and set the `a3n-tech` marketplace `repo` to `a3n-tech/a3n-atlas`. Say so in the report.

This pins the repo-level tools: the token savers `ponytail` (smallest working change) and
`caveman` (terse output). `enabledPlugins` does not install anything.
Each person installs Atlas once (below); `mattpocock-skills` comes with it as a dependency.
If they still have the old `harness` plugin, uninstall it first (`claude plugin uninstall harness@a3n-tech`), or both
sets of hooks run.

Person-level install, if the teammate has not done it (needs Claude Code 2.1.324+):

```bash
gh auth login && gh auth setup-git    # the marketplace is private; or use an SSH key
claude plugin marketplace add a3n-tech/a3n-atlas
claude plugin install a3ntech@a3n-tech
```

Updates: `claude plugin update a3ntech@a3n-tech`, or turn on auto-update for the marketplace in `/plugin`.

Third-party marketplaces (ponytail, caveman) are **pinned to reviewed commits** via `ref` (full SHA;
needs Claude Code 2.1.324+). Keep the pins from the template. Bumping a pin is a deliberate PR to
`a3n-tech/a3n-atlas`: review the upstream diff of its hooks (network calls, exec, file access) first.

Never write to `.claude/settings.local.json` — that is personal and not committed.

## 4. Team rules (repo-level, committed)

Target: `CLAUDE.md` at the repo root (create it with a `# <repo name>` heading if missing).

- Contains `<!-- harness:team-rules:start` → replace everything between the start and
  `<!-- harness:team-rules:end -->` markers with the current `team-rules.md` (this is how
  rule updates roll out). Show the diff first if it changes anything.
- Otherwise → append `team-rules.md` at the end.

Never edit content outside the markers.

## 4a. README pointer and setup guide (repo-level, committed)

Every team repo's `README.md` carries a short pointer (12 lines max) to `CLAUDE.md`, `docs/agents/` and
`docs/HARNESS-SETUP.md`. Same marker rule as the team rules:

- Contains `<!-- harness:readme:start` → replace everything between the start and
  `<!-- harness:readme:end -->` markers with `${CLAUDE_SKILL_DIR}/readme-section.md`.
- Otherwise → append it at the end (create `README.md` with a `# <repo name>` heading if missing).

Never edit the project's own README content outside the markers.

Setup and troubleshooting detail lives in `docs/HARNESS-SETUP.md`. Copy `${CLAUDE_SKILL_DIR}/harness-setup.md`
there (create `docs/` if needed). If the target's first line is `<!-- managed by /harness:setup`, replace the
whole file; if it exists without that line, leave it and say so.

## 4b. Collaboration automation (repo-level, committed)

Ensure `.gitattributes` contains (append missing lines, never duplicate):

```
.paul/** merge=paul-ai
```

The session-start hook registers the `paul-ai` driver in each clone automatically; it asks
Claude to merge both sides of a `.paul/` conflict and falls back to `/a3ntech:sync`.

Session-end posts ticket handoffs to the issue and writes the session journal to the brain.

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

## 4c. Brain

Link the repo to the brain with `/a3ntech:brain`. It creates `projects/<repo-name>/` in
the brain repo (bootstrapping it if the org has none yet; the repo's own `CLAUDE.md` on its default branch declares it with a line `<!-- atlas:brain <owner>/<name> -->` (outside the managed rules block); without that line it is `<owner>/brain` for the repo's owner) and migrates any old
per-repo `brain/` folder. Do not copy brain workflows into the project repo.

## 4d. Migrations (existing repos; each step is a no-op when already clean)

Re-running setup removes what the harness no longer ships. Detect first, change only what matches, report
what was removed. Never touch `.claude/settings.local.json`.

**Graphify (removed in 0.8.0).** Only 54 `graphify query` runs against 2,857 hook nudges in 90 days.

1. `.claude/settings.json`: delete every hook whose `command` contains `graphify` (e.g. `graphify hook-guard ...`,
   with or without an absolute path). Drop a hook group or `hooks` event key left empty. Keep all other hooks.
2. Delete `.github/workflows/graphify-refresh.yml` if present (`git rm`).
3. `package.json`: delete a `graph:guard` script, and remove its step from the `verify` script (and from any
   CI workflow that calls it). Also delete `scripts/*graph*guard*` if it only served that script.
4. `.gitattributes`: delete the `graphify-out/graph.json merge=graphify` line (any line containing `merge=graphify`).
5. `graphify-out/`: if tracked, `git rm -r --cached -q graphify-out`; make sure `.gitignore` lists `graphify-out/`
   (replace the old `graphify-out/cache/...` partial lines with that one line).
6. `CLAUDE.md`: delete an old `## graphify` section outside the harness markers only if it is the stock
   graphify block; otherwise tell the person. Local `git config merge.graphify.*` and the graphify git hooks
   in `.git/hooks` are per clone: tell the person to run `graphify hook uninstall` if they have it.

**Plugins unpinned in 0.8.0.** In `.claude/settings.json`, remove these `enabledPlugins` keys only when the
value equals the old harness default (`true`); leave any other value alone and say so:
`superpowers@claude-plugins-official`, `engineering-skills@claude-code-skills`,
`engineering-advanced-skills@claude-code-skills`. If nothing in `enabledPlugins` still uses
`@claude-code-skills`, also remove the `claude-code-skills` entry from `extraKnownMarketplaces`.
Keep `mattpocock-skills`, `ponytail`, `caveman`; the `harness` key is renamed (see step 3).

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
