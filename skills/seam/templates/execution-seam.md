## Execution Seam — PAUL and the engineering skills

Two planning systems run in this repo. They do not compete; they work at different
altitudes, and this section is the contract between them.

**PAUL owns the horizon. The engineering skills own the slice.**

| | PAUL | Engineering skills (mattpocock) |
|---|---|---|
| Unit | Milestone → phase | Ticket → red/green slice |
| Horizon | Weeks to months | One context window |
| Record | `ROADMAP.md`, `MILESTONES.md`, `STATE.md`, `ledger.toml` | {{TRACKER}} issues, the diff |
| Answers | What are we building, in what order, where are we | How does this one thing get built well |
| Review | `/paul:audit` — architecture, before building | `/code-review` — the diff, after building |

### The flow

```
/paul:plan <phase>      scope and sequence the phase
  └── /to-tickets       that phase's slices become {{TRACKER}} issues with blocking edges
        └── /implement   per issue, /clear between (drives /tdd, closes with /code-review)
/paul:verify            the phase is done when its issues are closed
/paul:complete-milestone
```

The **phase is the unit of record**; the **issue is the unit of execution**.

### Rules

1. **State follows the tracker.** A phase is never marked complete in `STATE.md` or
   `paul.toml` while any of its linked issues is open. {{TRACKER}} is the source of truth for
   what is open; PAUL is the source of truth for what it means.
2. **Link, never restate.** A phase references its issue numbers. It does not keep a
   second copy of the acceptance criteria — two copies drift, and the stale one is read
   as current.
3. **Skip `/to-spec` here.** `MILESTONES.md` is already the spec. Running it would
   produce a second plan with equal authority and no owner.
4. **Skip `/grill-with-docs` for work PAUL already scoped.** It re-opens settled
   decisions. Use it for a *new* idea, before it enters the roadmap.
5. **One build loop.** If a phase is being built through `/implement`, do not also run
   `/paul:apply` on it. Two implementers, one working tree.
6. **Owner tasks are not tickets.** Anything only the owner can close — credentials,
   dashboards, DNS, a rate someone must confirm — stays in `{{OWNER_DOC}}` and `/wizard`.
   Filing it as an issue creates work no agent can ever finish.

### Current mapping

| PAUL unit | Issues |
|---|---|
{{MAPPING_ROWS}}

When a phase records completion, name the issue explicitly — `closes #N`,
`delivered in #N`, `resolved by #N` (with the real number) — so the drift check can verify it.

Run `{{CHECK_CMD}}` to detect drift between the two.
