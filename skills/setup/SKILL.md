---
name: setup
description: Bootstrap the a3n-tech team harness in the current repo — checks git/gh, installs PAUL, pins the team plugins in .claude/settings.json, writes the team rules into CLAUDE.md, then hands off to /paul:init, /setup-matt-pocock-skills and /harness:seam. Use when someone says "set up the harness", "initialize our harness", "onboard this repo", or opens a repo that has no .paul/ or no team rules yet.
---

# Harness setup

One command to bring a repo (and a teammate) onto the team harness. Every step is
idempotent: detect first, write only what is missing, report what was skipped.

Files this skill ships: `${CLAUDE_SKILL_DIR}/project-settings.json`,
`${CLAUDE_SKILL_DIR}/team-rules.md`.

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
prompted to install `harness@a3n-tech`, `mattpocock-skills` and `superpowers`.

Never write to `.claude/settings.local.json` — that is personal and not committed.

## 4. Team rules (repo-level, committed)

Target: `CLAUDE.md` at the repo root (create it with a `# <repo name>` heading if missing).

- Contains `<!-- harness:team-rules:start` → replace everything between the start and
  `<!-- harness:team-rules:end -->` markers with the current `team-rules.md` (this is how
  rule updates roll out). Show the diff first if it changes anything.
- Otherwise → append `team-rules.md` at the end.

Never edit content outside the markers.

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
