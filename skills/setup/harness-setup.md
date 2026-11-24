<!-- managed by /harness:setup; edit in a3n-tech/harness, not here -->
# Harness setup and troubleshooting

Per-person setup for the a3n-tech harness. The team rules and the planning flow are in `CLAUDE.md`;
ticket and label rules are in `docs/agents/`.

**Node and npm:** use the versions in this repo's `package.json` `engines` field. Homebrew `node@22`
ships npm 10, so if `engines.npm` asks for 11, run `npm install -g npm@11`.

## One-time setup (per person)

1. Get access to the private repo `a3n-tech/harness` (ask an org owner).
2. Install the tools:
   ```bash
   gh auth login                      # GitHub CLI, needs repo scope
   node --version                     # match engines.node in package.json
   npm --version                      # match engines.npm in package.json
   git --version                      # 2.31+ (macOS: brew install git)
   ```
3. Clone this repo and open Claude Code in it. When asked, **trust the folder** and **install the
   plugins** it lists (`harness`, `mattpocock-skills`, `ponytail`, `caveman`).
   If you aren't asked, run:
   ```
   /plugin marketplace add a3n-tech/harness
   /plugin install harness@a3n-tech
   ```
4. Run `/harness:setup`. It installs PAUL on your machine, then checks that this
   repo is wired. **Restart Claude Code** after it installs anything.

## Set your role (once)

Run `/harness:role` and say what you do (e.g. "frontend", "backend and devops", "QA"). Roles: PMO, PM,
architect, frontend, backend, full-stack, DevOps, release engineer, QA/STE. Your sessions then focus on
your role's work and reach for its skills first; your tickets are labelled `role:<you>`. It's stored on your
machine only (`~/.config/a3n-harness/roles`).

## Daily workflow

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
`issue-12`, `feat/12-hero`). That's how the hooks find the ticket. Never commit to `main`.

**Human-only tasks** (API keys, accounts, DNS, registrations, approvals) are GitHub issues labelled
`ready-for-human`, assigned to whoever owns them. Agents only take `ready-for-agent`. Never paste a secret
into an issue — store it with `wrangler secret` or the password manager and close the issue with "done".

## What happens automatically

| When | What | Where to look |
|---|---|---|
| You open a session on a ticket branch | The latest teammate handoff for that issue is loaded into context | Issue comments marked *Session handoff* |
| You end a session on a ticket branch | WIP committed, branch pushed, draft PR opened, handoff comment posted (done / in progress / next / blockers) | The issue and its draft PR |
| Any session ends | Decisions and gotchas saved as one note per session | `brain/journal/` |
| Two people edit `.paul/` | AI merge driver merges both sides | `git log` |
| A conflict survives | Next session tells Claude to run `/harness:sync` | — |

**Safety rules built in:**
- Push, PR and handoff comment happen only when `origin` is a **private or internal** repo.
- WIP is **held back on your machine** if the diff looks like a secret, includes binaries or
  credential files (`.env`, `*.pem`, `id_rsa`…), or can't be read. The handoff says so.
- Handoffs are loaded only from repo owners, members and collaborators, and are treated as notes,
  never as instructions.
- Opt out of the session-end automation on your machine: `export HARNESS_HANDOFF=off`.

## Project brain (Obsidian)

`brain/` is the project's shared knowledge base and **source of truth for context**: decisions, glossary,
design, research, meetings, people and session journals, plus read-only mirrors of the plan
(`brain/plan/`) and open tickets (`brain/tickets/`). Claude reads `brain/index.md` every session.

**Developers:** nothing to set up — add or edit notes in `brain/` in your normal PRs.

**Editing in Obsidian (no Git skills needed), one-time:**
1. Clone this repo **outside** any existing Obsidian vault folder.
2. `git switch -c brain/<your-github-login>` then `git push -u origin brain/<your-github-login>`
   (must match your GitHub login).
3. Obsidian → *Open folder as vault* → `<repo>/brain`. Trust it and install the **Obsidian Git** plugin
   when prompted.
4. Write notes. Obsidian Git commits and pushes every few minutes; CI merges brain-only changes into
   `main` automatically and brings everyone else's notes back to you.

**Already use Obsidian with your own vault?** Nothing changes for it. The brain is a separate vault with
its own plugins and settings — switch between them with the vault switcher. Don't put the repo inside your
personal vault or symlink it in. Links between vaults don't work, so point to brain notes with plain links.

Auto-merge only accepts notes (`.md`) and images inside `brain/`, pushed by the branch's owner, with no secret
patterns. Obsidian settings/plugins (`brain/.obsidian/`), the hub `brain/index.md` and the generated mirrors
need a normal reviewed PR, as does anything outside `brain/`. Never put passwords or keys in a note.

## Conflicts

Don't resolve conflicts by hand. Run `/harness:sync`, or just start a session: the hook spots
the conflict and Claude resolves it. Planning files, code and lockfiles each have
their own rule. You're asked only when two tickets demand opposite behaviour.

## Saving tokens

| Tool | What it does | Turn off |
|---|---|---|
| `caveman` | Terse replies | say "normal mode" |
| `ponytail` | Smallest working change, no speculative code | say "stop ponytail" |

## Rules

Team rules (secrets, no AI attribution, raise everything you notice, planning stack) are in
`CLAUDE.md`, between the `harness:team-rules` markers. Claude loads them every session. Change
them in `a3n-tech/harness`, not here.

## Troubleshooting

| Problem | Fix |
|---|---|
| `/paul:*` or `/harness:*` not found | Restart Claude Code; run `/plugin` and check that `harness@a3n-tech` is enabled |
| No handoff posted | Branch name must start with the issue number; check `~/.claude/plugins/data/*harness*/harness.log` |
| `check:plan` reports `orphan` | An open `ready-for-agent` issue isn't linked to any phase: add it to a phase in `.paul/` |
| `check:plan` reports `premature` | A phase claims done while its issue is open: close the issue or reopen the phase |
| `check:plan` reports `conflict` | Run `/harness:sync` |
| `npm ci` or `npm run verify` fails on the npm version | Homebrew `node@22` ships npm 10. If `engines.npm` asks for 11, run `npm install -g npm@11` |
| Harness updated | `/plugin marketplace update a3n-tech`, then `/harness:setup` to refresh `CLAUDE.md` and this section |
