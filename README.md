# a3n-tech harness

Team harness for Claude Code. One contract for how we plan and build:

- **PAUL** owns the horizon — milestones and phases (`.paul/`).
- **mattpocock engineering skills** own the slice — ticket → red/green → diff (GitHub issues).
- **`check:plan`** catches the two drifts that matter: orphaned agent-ready tickets, and a
  phase claiming completion over an open ticket.

## Install (once per person)

```
/plugin marketplace add a3n-tech/harness
/plugin install harness@a3n-tech
```

Repos already on the harness commit `.claude/settings.json` that registers this marketplace,
so Claude Code prompts you to install it when you open the repo and trust the folder.

Also needed on your machine: `gh` logged in (`gh auth login`), Node 18+, `uv` or `pipx` (for graphify).

## Token savers

| Tool | Saves tokens by | Off switch |
|---|---|---|
| `caveman` | terse replies, no filler | "stop caveman" / "normal mode" |
| `ponytail` | smallest working diff, no speculative code | "stop ponytail" |
| `graphify` | answering codebase questions from `graphify-out/` instead of re-reading files | don't run `/graphify` |

## Onboard a repo

In the repo, run `/harness:setup`. It:

1. checks git + `gh`,
2. installs PAUL (`npx paul-framework@1.4.0 --global`) and graphify (`graphifyy==0.9.108`) if missing,
3. pins `harness`, `mattpocock-skills`, `superpowers`, `ponytail`, `caveman` in `.claude/settings.json`,
4. writes the team rules into `CLAUDE.md` between `harness:team-rules` markers,
5. walks you through `/paul:init` → `/mattpocock-skills:setup-matt-pocock-skills` (you type
   this one; agents can't) → `/harness:seam`.

Commit the result so the rest of the team gets it.

## Day-to-day flow

```
/paul:plan <phase>        scope + sequence the phase
  └── /to-tickets         phase slices become GitHub issues
        └── /implement    per issue, /clear between
/paul:verify              phase done when its issues are closed
/paul:complete-milestone
npm run check:plan        before merging anything that touches .paul/ or closes an issue
```

## Updating the harness

Change rules in `skills/setup/team-rules.md`, bump `version` in `.claude-plugin/plugin.json`,
merge. Teammates get it via `/plugin marketplace update a3n-tech`; re-run `/harness:setup` in a
repo to refresh its `CLAUDE.md` rules block.

## Contents

| Path | What |
|---|---|
| `skills/setup/` | `/harness:setup` — bootstrap a repo |
| `skills/seam/` | `/harness:seam` — Execution Seam + drift checker |
| `skills/seam/scripts/check-plan-drift.mjs` | the checker (read-only, needs `gh`) |
| `skills/setup/team-rules.md` | team rules block for `CLAUDE.md` |
| `skills/setup/project-settings.json` | plugin pins merged into a repo's `.claude/settings.json` |
