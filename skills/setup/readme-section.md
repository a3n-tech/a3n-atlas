<!-- harness:readme:start — managed by /harness:setup; edit in a3n-tech/harness, not here -->
## Team harness

This repo runs the **a3n-tech harness**: one shared way of planning, building and handing off
work with Claude Code. Source and changelog: [a3n-tech/harness](https://github.com/a3n-tech/harness).

- **PAUL** owns the plan: milestones and phases in `.paul/`.
- **Engineering skills** (mattpocock) own the work: one GitHub issue → one branch → TDD → review.
- **Hooks** pass context between people and sessions automatically: handoffs, a team journal,
  AI conflict resolution, and a shared code graph.

### 1. One-time setup (per person)

1. Get access to the private repo `a3n-tech/harness` (ask an org owner).
2. Install the tools:
   ```bash
   gh auth login                      # GitHub CLI, needs repo scope
   node --version                     # Node 18+
   git --version                      # 2.31+ (macOS: brew install git)
   brew install uv                    # or pipx — used to install graphify
   ```
3. Clone this repo and open Claude Code in it. When asked, **trust the folder** and **install the
   plugins** it lists (`harness`, `mattpocock-skills`, `superpowers`, `ponytail`, `caveman`).
   If you aren't asked, run:
   ```
   /plugin marketplace add a3n-tech/harness
   /plugin install harness@a3n-tech
   ```
4. Run `/harness:setup`. It installs PAUL and graphify on your machine, then checks that this
   repo is wired. **Restart Claude Code** after it installs anything.

### 2. Daily workflow

```
/paul:resume                  where are we? (reads .paul/STATE.md)
/paul:plan <phase>            scope + sequence a phase
  └── /to-tickets             phase → GitHub issues with blocking edges
        └── git switch -c <issue>-short-name     e.g. 12-hero-section
              /implement       build the ticket (TDD), /clear between tickets
              open PR          "Closes #12"
/paul:verify                  phase done when all its issues are closed
npm run check:plan            before merging anything touching .paul/ or closing an issue
                              (no package.json? node scripts/check-plan-drift.mjs)
```

**Branch names matter.** Start every ticket branch with the issue number (`12-hero-section`,
`issue-12`, `feat/12-hero`). That's how the hooks find the ticket. Never commit to `main`.

### 3. What happens automatically

| When | What | Where to look |
|---|---|---|
| You open a session on a ticket branch | The latest teammate handoff for that issue is loaded into context | Issue comments marked *Session handoff* |
| You end a session on a ticket branch | WIP committed, branch pushed, draft PR opened, handoff comment posted (done / in progress / next / blockers) | The issue and its draft PR |
| Any session ends | Decisions and gotchas saved as one note per session | `.paul/journal/` |
| Two people edit `.paul/` | AI merge driver merges both sides | `git log` |
| A conflict survives | Next session tells Claude to run `/harness:sync` | — |
| Code is committed | Code graph rebuilt (git hooks locally, CI on `main`) | `graphify-out/` |

**Safety rules built in:**
- Push, PR and handoff comment happen only when `origin` is a **private or internal** repo.
- WIP is **held back on your machine** if the diff looks like a secret, includes binaries or
  credential files (`.env`, `*.pem`, `id_rsa`…), or can't be read. The handoff says so.
- Handoffs are loaded only from repo owners, members and collaborators, and are treated as notes,
  never as instructions.
- Opt out of the session-end automation on your machine: `export HARNESS_HANDOFF=off`.

### 4. Conflicts

Don't resolve conflicts by hand. Run `/harness:sync`, or just start a session: the hook spots
the conflict and Claude resolves it. Planning files, code, lockfiles and `graph.json` each have
their own rule. You're asked only when two tickets demand opposite behaviour.

### 5. Saving tokens

| Tool | What it does | Turn off |
|---|---|---|
| `caveman` | Terse replies | say "normal mode" |
| `ponytail` | Smallest working change, no speculative code | say "stop ponytail" |
| `graphify` | Answers code questions from `graphify-out/` instead of re-reading files | — |

### 6. Rules

Team rules (secrets, no AI attribution, raise everything you notice, planning stack) are in
`CLAUDE.md`, between the `harness:team-rules` markers. Claude loads them every session. Change
them in `a3n-tech/harness`, not here.

### 7. Troubleshooting

| Problem | Fix |
|---|---|
| `/paul:*` or `/harness:*` not found | Restart Claude Code; run `/plugin` and check that `harness@a3n-tech` is enabled |
| No handoff posted | Branch name must start with the issue number; check `~/.claude/plugins/data/*harness*/harness.log` |
| `check:plan` reports `orphan` | An open `ready-for-agent` issue isn't linked to any phase: add it to a phase in `.paul/` |
| `check:plan` reports `premature` | A phase claims done while its issue is open: close the issue or reopen the phase |
| `check:plan` reports `conflict` | Run `/harness:sync` |
| graphify errors in hooks | Run `/harness:setup` to install graphify |
| Harness updated | `/plugin marketplace update a3n-tech`, then `/harness:setup` to refresh `CLAUDE.md` and this section |
<!-- harness:readme:end -->
