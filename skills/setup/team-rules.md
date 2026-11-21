<!-- harness:team-rules:start — managed by /harness:setup; edit in a3n-tech/harness, not here -->
## Team rules (a3n-tech harness)

These apply to every person and every agent working in this repo.

### Secrets — never output them

- Never put API keys, tokens, passwords, credentials, auth-embedded URLs, PII, or secret env
  values in any response, commit, PR, issue, file, or log.
- Found one? Stop and tell the person: say **what** and **where** (`file:line`, variable name)
  without the value, mask it (`sk-****`), and recommend rotating it and moving it to env/secret storage.
- When in doubt, treat it as sensitive.

### No AI attribution

- No `Co-Authored-By: Claude`, no "Generated with Claude Code", no 🤖 footers, no AI mention in
  commits, PR titles/bodies/comments, issues, code comments, or release notes.
- Work is authored as the person running the session. Write it as they would.

### Raise everything you notice

- Bugs, security holes, doc drift, dead code, risky config, missing tests, a wrong assumption
  in the request: mention it with `file:line` and why it matters, ranked by severity.
- Raise it, don't silently fix it. Fix only what is in the current task's scope.
- If a plan looks wrong or risky, say so plainly, then do what the owner decides.

### Planning stack — PAUL + engineering skills

**PAUL owns the horizon (milestone → phase). The engineering skills own the slice (ticket → red/green → diff).**

Flow: `/paul:plan <phase>` → `/to-tickets` → `/implement` per ticket (`/clear` between) →
`/paul:verify` → `/paul:complete-milestone`. The phase is the unit of record; the ticket is the
unit of execution.

1. **State follows the tracker.** Never mark a phase complete while a linked ticket is open.
2. **Link, never restate.** A phase cites ticket numbers; it does not copy acceptance criteria.
3. **One spec.** PAUL's milestones are the spec — skip `/to-spec`.
4. **One build loop.** A phase built through `/implement` is never also `/paul:apply`'d.
5. **Don't re-grill settled work.** `/grill-with-docs` is for new ideas, before the roadmap.
6. **Owner-only work is never a ticket.** Credentials, dashboards, DNS, rates to confirm live in
   the go-live doc and `/wizard`.

Full contract: `.paul/SPECIAL-FLOWS.md` → "Execution Seam". Drift check: `npm run check:plan`
(or `node scripts/check-plan-drift.mjs`).

### Collaboration

- Branch per ticket, never commit to `main` directly. PRs reference the ticket (`closes #N`).
- Run the drift check before merging anything that changes `.paul/` or closes a ticket.
- Pull before `/paul:resume` — `.paul/STATE.md` is shared; resolve conflicts in it by hand, never
  by taking one side wholesale.
<!-- harness:team-rules:end -->
