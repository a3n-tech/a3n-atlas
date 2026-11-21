---
name: setup
description: Onboard a repo or a teammate onto the a3n-tech team harness — installs PAUL and graphify, pins the team plugins (mattpocock-skills, superpowers, ponytail, caveman) in .claude/settings.json, writes the team rules into CLAUDE.md, wires the AI merge driver and session journal, then walks through /paul:init and /harness:seam. Use this whenever someone says set up / initialize / install our harness, onboard this repo, get me set up on this project, start a new team repo, or when a repo has no .paul/ or no harness rules block in CLAUDE.md, even if they never say "harness". Not for planning a phase (/paul:plan) or toggling a single plugin.
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
from `.gitignore`), except machine-local files — ensure `.gitignore` has:

```
graphify-out/cache/
graphify-out/.graphify_build_state.json
graphify-out/.graphify_labels.pending.json
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

This is what distributes the harness: anyone who opens the repo and trusts the folder is
prompted to install `harness@a3n-tech`, `mattpocock-skills`, `superpowers`, and the token savers
`ponytail` (smallest working change) and `caveman` (terse output).

Never write to `.claude/settings.local.json` — that is personal and not committed.

## 4. Team rules (repo-level, committed)

Target: `CLAUDE.md` at the repo root (create it with a `# <repo name>` heading if missing).

- Contains `<!-- harness:team-rules:start` → replace everything between the start and
  `<!-- harness:team-rules:end -->` markers with the current `team-rules.md` (this is how
  rule updates roll out). Show the diff first if it changes anything.
- Otherwise → append `team-rules.md` at the end.

Never edit content outside the markers.

## 4b. Collaboration automation (repo-level, committed)

Ensure `.gitattributes` contains (append missing lines, never duplicate):

```
.paul/** merge=paul-ai
```

The session-start hook registers the `paul-ai` driver in each clone automatically; it asks
Claude to merge both sides of a `.paul/` conflict and falls back to `/harness:sync`.

Ensure `.paul/journal/` exists with a `.gitkeep`. Session-end writes one note per session
there (never conflicts) and posts ticket handoffs to the issue.

Tell the person once, plainly: on a ticket branch (`<N>-slug`, `issue-<N>`), ending a session
**commits WIP, pushes the branch, opens a draft PR and comments a handoff on the issue**. A
diff that matches a secret pattern is held back, not pushed. Opt out per machine with
`HARNESS_HANDOFF=off`.

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
