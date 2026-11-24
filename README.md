# Atlas

Atlas is the a3n-tech agentic team toolkit, a Claude Code plugin. It runs the team like a scrum team:
everyone works from the same brain, the same plugins and the same process, each person in a role.

- **PAUL** owns the horizon: milestones and phases (`.paul/`).
- **mattpocock engineering skills** own the slice: ticket, red/green, diff (GitHub issues).
- **`check:plan`** catches orphaned agent-ready tickets and phases that claim completion over an open ticket.
- **Roles** (`/a3ntech:role`) change a person's focus and tools, never the plan.
- **Brain** (default `<owner>/brain`) holds team context for every project.

## Install (once per person)

Needs Claude Code 2.1.324+ and Node 18+. The marketplace is private, so
git needs credentials (or use an SSH key):

```bash
gh auth login && gh auth setup-git
claude plugin marketplace add a3n-tech/a3n-atlas
claude plugin install a3ntech@a3n-tech
```

Or use `/plugin ...` inside Claude Code. `mattpocock-skills` is pinned per repo by setup (not a plugin dependency: a dependency that cannot be installed would stop Atlas loading at all).
Had the old `harness` plugin? Remove it first, or both sets of hooks run: `claude plugin uninstall harness@a3n-tech`. `ponytail` and `caveman` stay as repo-level pins in `.claude/settings.json`,
written by setup. Opening a repo does not install anything: `enabledPlugins` only enables what is already installed.

Update with `claude plugin update a3ntech@a3n-tech`, or turn on auto-update for the marketplace in `/plugin`.
Also needed on your machine: `gh` logged in (`gh auth login`), and the Node and npm versions in the project's `package.json` `engines` field (Homebrew `node@22` ships npm 10; install npm 11 if the project asks for it).

## Per-person options

Set in `/config` or with `claude plugin configure a3ntech@a3n-tech`.

| Option | Default | What |
|---|---|---|
| `handoff` | on | Session-end WIP commit, push, draft PR and handoff comment. Legacy `HARNESS_HANDOFF=off` still works. |
| `brain_dir` | empty | Optional: folder that holds one clone per brain. |

## Token savers

| Tool | Saves tokens by | Off switch |
|---|---|---|
| `caveman` | terse replies, no filler | "stop caveman" / "normal mode" |
| `ponytail` | smallest working diff, no speculative code | "stop ponytail" |

## Onboard a repo

In the repo, run `/a3ntech:setup`. It:

1. checks git and `gh`,
2. installs PAUL (`npx paul-framework@1.4.0 --global`) if missing,
3. pins `ponytail` and `caveman` in `.claude/settings.json`,
4. writes the team rules into `CLAUDE.md`, a short pointer into `README.md` (marker-managed) and the setup guide into `docs/HARNESS-SETUP.md`,
5. adds `.paul/** merge=paul-ai` to `.gitattributes`,
6. reviews `.github/workflows/*` for CI cost and proposes fixes (see CI budget),
7. links the repo to the brain with `/a3ntech:brain`,
8. walks you through `/paul:init`, then `/mattpocock-skills:setup-matt-pocock-skills` (you type this one;
   agents can't), then `/a3ntech:seam`.

Commit the result so the rest of the team gets it.

## Brain

One repo of notes with `projects/<repo-name>/` per project. Which brain a repo uses is committed config: the repo's own `CLAUDE.md` on its default branch declares it with a line `<!-- atlas:brain <owner>/<name> -->` (outside the managed rules block); without that line it is `<owner>/brain` for the repo's owner. Brains must be private or internal. At session start the plugin keeps a
local clone current in the background and injects the team hub and the project hub. Session journals go to
`projects/<repo>/journal/`, each as its own branch `notes/<github-login>/<session>` and PR, and the brain's CI gate auto-merges
plain notes. `/a3ntech:brain` bootstraps the brain repo (once per org), links a project repo, and migrates an
old per-repo `brain/` folder. Details: `skills/brain/central/README.md`.

## How context moves

| Gap | Automation |
|---|---|
| `.paul/STATE.md` edited by two people | `paul-ai` git merge driver asks Claude to merge both sides; leftovers go to `/a3ntech:sync`; `check:plan` fails on markers |
| Someone stops mid-ticket | SessionEnd: WIP commit (secret-scanned, `[skip ci]`), push, draft PR, AI handoff comment on the issue. SessionStart loads it for the next person |
| Team context | Brain: local clone kept current at session start; hubs injected; journals pushed as `notes/<login>/<session>` branches with PRs |
| Who works on what | `role:<id>` label on every ticket; the session lists your role's queue |

The handoff only runs on ticket branches (`<N>-slug`, `issue-<N>`, `gh-<N>`, `<type>/<N>-slug`) with an open issue,
never during a merge, rebase or cherry-pick, and never changes your staging.

Logs: `~/.claude/plugins/data/a3ntech-a3n-tech/harness.log`. Self-test: `node scripts/selftest.mjs`.

## CI budget

The org has 2000 Actions minutes a month. In November, CI on every agent draft PR was about 48% of minutes
and an `issues:`-triggered drift check about 14%. `/a3ntech:setup` reviews each repo's workflows and, with the
person's OK, applies: skip draft PRs, cancel superseded runs, `paths-ignore` for docs, `timeout-minutes` on every
job, no `issues:` triggers, schedules no more often than every 6 hours, cached installs. Deploy workflows are
never changed without asking.

## Day-to-day flow

```
/paul:plan <phase>        scope + sequence the phase
  └── /to-tickets         phase slices become GitHub issues
        └── /implement    per issue, /clear between
/paul:verify              phase done when its issues are closed
/paul:complete-milestone
npm run check:plan        before merging anything that touches .paul/ or closes an issue
```

## Releasing

Change rules in `skills/setup/team-rules.md`, bump `version` in `.claude-plugin/plugin.json`, add an entry to
`CHANGELOG.md`, merge, then run `claude plugin tag --push`. Teammates update with
`claude plugin update a3ntech@a3n-tech`; re-run `/a3ntech:setup` in a repo to refresh its `CLAUDE.md` rules block.

## Contents

| Path | What |
|---|---|
| `skills/setup/` | `/a3ntech:setup`: bootstrap a repo |
| `skills/seam/` | `/a3ntech:seam`: Execution Seam and drift checker |
| `skills/sync/` | `/a3ntech:sync`: AI conflict resolution |
| `skills/role/` | `/a3ntech:role`: per-person role lens at session start (`roles/*.md`) |
| `skills/brain/` | `/a3ntech:brain`: brain bootstrap, link and migrate |
| `skills/brain/central/` | files for a brain repo: hubs, project template, gate and mirror scripts |
| `hooks/hooks.json`, `scripts/` | SessionStart/SessionEnd automation, brain pull, AI merge driver |
| `skills/seam/scripts/check-plan-drift.mjs` | the drift checker (read-only, needs `gh`) |
| `skills/setup/team-rules.md` | team rules block for `CLAUDE.md` |
| `skills/setup/readme-section.md` | how-to section written into every project `README.md` |
| `skills/setup/project-settings.json` | repo-level plugin pins merged into `.claude/settings.json` |
| `evals/` | trigger evals: `claude plugin eval . --runs 2` (needs git 2.31+) |

Tests: `node scripts/selftest.mjs`, `node skills/seam/scripts/check-plan-drift.test.mjs`, `bash -eo pipefail tests/gate.test.sh` and `bash tests/hooks.test.sh` (stubbed gh and claude, no network).
