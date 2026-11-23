---
name: setup
description: Onboard a repo or a teammate onto the a3n-tech team harness — installs PAUL, pins the team plugins (mattpocock-skills, ponytail, caveman) in .claude/settings.json, writes the team rules into CLAUDE.md, wires the AI merge driver and session journal, then walks through /paul:init and /harness:seam. Use this whenever someone says set up / initialize / install our harness, onboard this repo, get me set up on this project, start a new team repo, or when a repo has no .paul/ or no harness rules block in CLAUDE.md, even if they never say "harness". Not for planning a phase (/paul:plan) or toggling a single plugin.
---

# Harness setup

One command to bring a repo (and a teammate) onto the team harness. Every step is
idempotent: detect first, write only what is missing, report what was skipped.

Files this skill ships: `${CLAUDE_SKILL_DIR}/project-settings.json`,
`${CLAUDE_SKILL_DIR}/team-rules.md`, `${CLAUDE_SKILL_DIR}/readme-section.md`, `${CLAUDE_SKILL_DIR}/harness-setup.md`.

## 1. Preconditions

```bash
git rev-parse --show-toplevel && git remote -v && gh auth status
```

- Not a git repo, or no GitHub remote → stop and ask. The harness needs GitHub issues.
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

This is what distributes the harness: anyone who opens the repo and trusts the folder is
prompted to install `harness@a3n-tech`, `mattpocock-skills`, and the token savers
`ponytail` (smallest working change) and `caveman` (terse output).

Third-party marketplaces (ponytail, caveman, claude-code-skills) are **pinned to reviewed commits** via `ref` (full SHA;
needs Claude Code 2.1.324+). Keep the pins from the template. Bumping a pin is a deliberate PR to
`a3n-tech/harness`: review the upstream diff of its hooks (network calls, exec, file access) first.

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
Claude to merge both sides of a `.paul/` conflict and falls back to `/harness:sync`.

Session-end writes one note per session into `brain/journal/` (never conflicts) and posts ticket handoffs to the issue.

Tell the person once, plainly: on a ticket branch (`<N>-slug`, `issue-<N>`), ending a session
**commits WIP, pushes the branch, opens a draft PR and comments a handoff on the issue**. A
diff that matches a secret pattern is held back, not pushed. Opt out per machine with
`HARNESS_HANDOFF=off`.

## 4b2. Roles

Create the nine `role:<id>` labels (see `/harness:role`, "Tickets by role") if missing. Then put the routing
rules where the ticket skills read them: in `docs/agents/triage-labels.md`, replace the block between
`<!-- harness:role-labels:start` and `<!-- harness:role-labels:end -->` with
`${CLAUDE_SKILL_DIR}/../role/role-labels.md` (append it if the markers are missing). Same for Jira or any
other tracker — the labels are the concept; `docs/agents/issue-tracker.md` says how to apply them. Then ask the person
which role(s) they hold and run `/harness:role` — roles are per machine, never committed.

## 4c. Project brain

If `brain/index.md` is missing, run `/harness:brain` (it scaffolds the vault, moves `.paul/journal`,
`docs/design`, ADRs and glossary into it, and installs the mirror + sync workflows). Every team repo has one.

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
Keep `harness`, `mattpocock-skills`, `ponytail`, `caveman`.

## 5. Hand off — the steps only a person can run

Check each and list only what is still missing, in this order:

| Missing | Who runs it | Why |
|---|---|---|
| `.paul/PROJECT.md` | `/paul:init` (you can run it; it is conversational — ask its questions one at a time) | PAUL needs the project brief before the seam |
| `docs/agents/issue-tracker.md` | the **person** runs `/mattpocock-skills:setup-matt-pocock-skills` — it is user-only | the seam reads tracker + triage labels from it |
| `## Execution Seam` in `.paul/SPECIAL-FLOWS.md` | `/harness:seam` | wires PAUL ↔ tickets and installs `check:plan` |

If `.paul/PROJECT.md` is missing, start `/paul:init` now. Stop before the user-only step and
tell the person exactly what to type.

## 6. Report

A few lines: what was installed, what was written or skipped, what the person must do next
(one action). Do not commit unless asked. If asked, one commit:
`chore: adopt team harness`. No AI attribution in the message.
