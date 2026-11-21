## Two planning systems — know which one you are in

This repo runs PAUL (`.paul/`) alongside the engineering skills. **PAUL owns the horizon —
milestones and phases. The skills own the slice — a ticket, a red/green loop, a diff.**

The contract is written in `.paul/SPECIAL-FLOWS.md` under "Execution Seam". The parts that
change what you do:

- **A PAUL phase becomes a `/to-tickets` run.** The phase is the unit of record; the
  issue is the unit of execution.
- **Do not run `/to-spec`.** `.paul/MILESTONES.md` is already the spec; a second one would have
  equal authority and no owner.
- **Do not `/grill-with-docs` work PAUL already scoped.** That re-opens a settled decision. Use
  it for a new idea, before it enters the roadmap.
- **State follows the tracker.** Never mark a phase complete while a linked issue is open.
- **Human-only work is `ready-for-human`.** Credentials, API keys, accounts, DNS, a rate someone
  must confirm — those are `ready-for-human` issues (linked from `{{OWNER_DOC}}`). Never pick them up,
  never relabel them `ready-for-agent`, never put a secret in one.
- **Where decisions live.** If this repo has no `docs/adr/`, the dated entries in
  `.paul/STATE.md` are the decision record. Surface contradictions with them; do not silently
  override.

`{{CHECK_CMD}}` enforces the two rules that actually drift: orphaned agent-ready issues,
and a phase claiming completion over an open issue.
