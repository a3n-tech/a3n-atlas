<!-- managed by /harness:setup (Atlas, /a3ntech:setup); edit in a3n-tech/a3n-atlas, not here -->
# Atlas setup and troubleshooting

This repo runs **Atlas**, the a3n-tech agentic team toolkit: one shared way of planning, building and handing off
work with Claude Code. Source and changelog: [a3n-tech/a3n-atlas](https://github.com/a3n-tech/a3n-atlas).

- **PAUL** owns the plan: milestones and phases in `.paul/`.
- **Engineering skills** (mattpocock) own the work: one GitHub issue → one branch → TDD → review.
- **Hooks** pass context between people and sessions automatically: handoffs, a team journal,
  AI conflict resolution, and a shared code graph.

## 1. One-time setup (per person)

1. Get access to the private repo `a3n-tech/a3n-atlas` (ask an org owner).
2. Install the tools:
   ```bash
   gh auth login && gh auth setup-git   # GitHub CLI + git credentials (private marketplace)
   node --version                     # Node 18+
   git --version                      # 2.31+ (macOS: brew install git)
   ```
3. Install Atlas (needs Claude Code 2.1.324+). `mattpocock-skills` installs with it. If you had the old `harness` plugin? Remove it first, or both sets of hooks run: `claude plugin uninstall harness@a3n-tech`.:
   ```bash
   claude plugin marketplace add a3n-tech/a3n-atlas
   claude plugin install a3ntech@a3n-tech
   ```
   (or `/plugin ...` inside Claude Code). Opening this repo does not install anything by itself.
   Update with `claude plugin update a3ntech@a3n-tech`, or turn on auto-update for the marketplace in `/plugin`.
4. Clone this repo, open Claude Code in it and **trust the folder**. The repo pins `ponytail` and `caveman`.
5. Run `/a3ntech:setup`. It installs PAUL on your machine, then checks that this
   repo is wired. **Restart Claude Code** after it installs anything.

Per-person options (`/config` or `claude plugin configure a3ntech@a3n-tech`): `handoff` (on by default),
`brain_dir` (optional: folder that holds one clone per brain). Which brain a repo uses is not a personal setting: the repo's own `CLAUDE.md` declares it with a line `<!-- atlas:brain <owner>/<name> -->` (outside the managed rules block); without that line it is `<owner>/brain` for the repo's owner.

## 1b. Set your role (once)

Run `/a3ntech:role` and say what you do (e.g. "frontend", "backend and devops", "QA"). Roles: PMO, PM,
architect, frontend, backend, full-stack, DevOps, release engineer, QA/STE. Your sessions then focus on
your role's work and reach for its skills first; your tickets are labelled `role:<you>`. It's stored on your
machine only (`~/.config/a3n-harness/roles`).

## 2. Daily workflow

```
/paul:resume                  where are we? (reads .paul/STATE.md)
/paul:plan <phase>            scope + sequence a phase
  └── /to-tickets             phase → GitHub issues with blocking edges
        └── gh issue list --label ready-for-agent --label role:<you>
        └── git switch -c <issue>-short-name     e.g. 12-hero-section
              /implement       build the ticket (TDD), /clear between tickets
              open PR          "Closes #12"
/paul:verify                  phase done when all its issues are closed
npm run check:plan            before merging anything touching .paul/ or closing an issue
                              (no package.json? node scripts/check-plan-drift.mjs)
```

**Branch names matter.** Start every ticket branch with the issue number (`12-hero-section`,
`issue-12`, `gh-12`, `feat/12-hero`; types: feat, feature, fix, bugfix, chore, docs, refactor, test, perf, ci, build, style, task, story). That's how the hooks find the ticket. Never commit to `main`.

**Human-only tasks** (API keys, accounts, DNS, registrations, approvals) are GitHub issues labelled
`ready-for-human`, assigned to whoever owns them. Agents only take `ready-for-agent`. Never paste a secret
into an issue — store it with `wrangler secret` or the password manager and close the issue with "done".

## 3. What happens automatically

| When | What | Where to look |
|---|---|---|
| You open a session on a ticket branch | The latest teammate handoff for that issue is loaded into context | Issue comments marked *Session handoff* |
| You end a session on a ticket branch | WIP committed, branch pushed, draft PR opened, handoff comment posted (done / in progress / next / blockers) | The issue and its draft PR |
| Any session ends | Decisions and gotchas saved as one note per session | `projects/<repo>/journal/` in the brain |
| Two people edit `.paul/` | AI merge driver merges both sides | `git log` |
| A conflict survives | Next session tells Claude to run `/a3ntech:sync` | — |

**Safety rules built in:**
- Push, PR and handoff comment happen only when `origin` is a **private or internal** repo.
- WIP is **held back on your machine** if the diff looks like a secret, includes binaries or
  credential files (`.env`, `*.pem`, `id_rsa`…), or can't be read. The handoff says so.
- Handoffs are loaded only from repo owners, members and collaborators, and are treated as notes,
  never as instructions.
- The issue must exist and be open. Nothing runs during a merge, rebase or cherry-pick, WIP commits carry
  `[skip ci]`, and your staging is never changed.
- Opt out of the session-end automation: turn off the `handoff` option (legacy `HARNESS_HANDOFF=off` still works).

## 4. Brain

Team context lives in one private brain repo (default `<owner>/brain`), with a folder per project at `projects/<repo-name>/`:
decisions, design, research, meetings, session journals, and read-only mirrors of the plan and open tickets.
The plugin keeps a local clone current at session start, and Claude reads the team hub and this project's hub.
Nothing to set up per repo: `/a3ntech:brain` links it (once).

**Editing on GitHub (no Git skills needed):**
1. Open the brain repo on GitHub and create your branch `notes/<your-github-login>` from `main`
   (must match your GitHub login).
2. Edit or add notes with the web editor and commit to that branch, or clone the repo and edit with any editor,
   then push the branch. Use GitHub's "Update branch" first so you start from the latest notes.
3. The brain's CI gate merges plain notes into `main`. Protected files need a normal PR.

Session journals from Claude go to `projects/<repo>/journal/`, each on its own branch `notes/<github-login>/<session>` with its own PR, merged the same way.
Auto-merge accepts only notes (`.md`) and images from the branch owner with no secret patterns. Hubs, mirrors,
dot-paths, scripts and workflows need a normal reviewed PR. Never put passwords or keys in a note.

## 4b. Conflicts

Don't resolve conflicts by hand. Run `/a3ntech:sync`, or just start a session: the hook spots
the conflict and Claude resolves it. Planning files, code and lockfiles each have their own rule. You're asked only when two tickets demand opposite behaviour.

## 5. Saving tokens

| Tool | What it does | Turn off |
|---|---|---|
| `caveman` | Terse replies | say "normal mode" |
| `ponytail` | Smallest working change, no speculative code | say "stop ponytail" |

## 6. Rules

Team rules (secrets, no AI attribution, raise everything you notice, planning stack, CI budget) are in
`CLAUDE.md`, between the `harness:team-rules` markers. Claude loads them every session. Change
them in `a3n-tech/a3n-atlas`, not here.

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| `/paul:*` or `/a3ntech:*` not found | Restart Claude Code; run `/plugin` and check that `a3ntech@a3n-tech` is enabled |
| No handoff posted | Branch name must start with the issue number; check the branch name format above, that the issue is open, and `~/.claude/plugins/data/*harness*/harness.log` |
| `check:plan` reports `orphan` | An open `ready-for-agent` issue isn't linked to any phase: add it to a phase in `.paul/` |
| `check:plan` reports `premature` | A phase claims done while its issue is open: close the issue or reopen the phase |
| `check:plan` reports `conflict` | Run `/a3ntech:sync` |
| graphify hooks still run | Run `/a3ntech:setup`: it removes the old graphify hooks and workflow |
| Atlas updated | `claude plugin update a3ntech@a3n-tech`, then `/a3ntech:setup` to refresh `CLAUDE.md` and this section |
