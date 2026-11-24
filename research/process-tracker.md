# Process and tracker: CCPM, BMAD, Spec Kit vs PAUL and mattpocock skills

Ticket: a3n-tech/atlas#12 (map #10). Researched 2026-11-23. Facts below come from each repo's LICENSE file, README, docs and the GitHub API (`gh api`), read on that date. Anything not confirmed is marked "not verified".

## What Atlas does today

Read from `origin/main` and, for newer code, a local checkout of branch `torpedo88/hardening` (not pushed). The hardening copy differs from main in `skills/seam/SKILL.md`, `skills/setup/team-rules.md` and `skills/seam/scripts/check-plan-drift.mjs`.

| Need | What Atlas has | Source |
|---|---|---|
| Phases linked to tickets | PAUL owns milestone and phase; mattpocock skills own ticket and diff. The "Execution Seam" in `.paul/SPECIAL-FLOWS.md` maps a phase to issue numbers. Rules: state follows the tracker, link never restate, one spec, one build loop. | `skills/seam/SKILL.md`, `skills/setup/team-rules.md` |
| Role labels and queues | Nine roles (`pmo`, `pm`, `architect`, `frontend`, `backend`, `fullstack`, `devops`, `release`, `qa`). Every ticket gets one `role:<id>` label; the session lists your role's queue via `gh issue list --label ready-for-agent --label role:<id>`. Roles are stored per person in `~/.config/a3n-harness/`. | `skills/role/SKILL.md` |
| Handoffs | Session end commits WIP on a ticket branch, opens a draft PR with `Closes #N`, posts an AI handoff comment on the issue. Session start loads it. | `skills/setup/team-rules.md` |
| Drift check | `check-plan-drift.mjs`: orphan (open `ready-for-agent` issue no plan file cites), premature (plan says "closes #N" while the issue is open), unrouted (role label count is not exactly one), unresolved merge markers. It calls `gh`, so GitHub only. Hardening adds fail-closed on `gh` errors, a 500-issue cap and a 100-issue range cap. | `skills/seam/scripts/check-plan-drift.mjs` |
| Jira or ADO | None. The tracker is GitHub through `gh`. | same script, `skills/seam/SKILL.md` |

## Summary table

| | CCPM | BMAD Method | Spec Kit | PAUL + mattpocock (Atlas) |
|---|---|---|---|---|
| License | MIT | MIT per LICENSE file (GitHub API shows NOASSERTION, so the file is the source), plus a trademark notice | MIT | not verified (not researched here) |
| Last commit | 2026-11-04 | 2026-11-12 | 2026-11-23 | n/a |
| Latest release | none published | v6.12.4, 2026-10-14 | v1.4.4, 2026-11-23 | n/a |
| Claude Code | Yes, install steps in README | Yes, docs index names Claude Code | Yes, `claude` integration | Yes, native |
| Tracker | GitHub Issues via `gh` | none seen in README or docs index: not verified | none in core; community extensions for Jira and ADO | GitHub |
| Roles | none found: not verified | persona agents (product, architecture, UX, dev, test), not ticket routing | bundles for "a role or team" (README) | `role:<id>` labels and queues |
| Drift check | none found: not verified | none found: not verified | `/speckit-converge` checks code against spec, not plan against tracker | `check:plan` |

## CCPM (automazeio/ccpm)

- License: MIT, `LICENSE`, "Copyright (c) 2025 Ran Aroussi". https://github.com/automazeio/ccpm/blob/main/LICENSE
- Maintenance: created 2025-08-18, last commit 2026-11-04, not archived, no releases. https://github.com/automazeio/ccpm
- Claude Code: README lists Claude Code; install is a symlink of `skill/ccpm/` into `.claude/skills/`. It follows the agentskills.io standard.
- Flow: PRD, epic, tasks, sync to GitHub issues, parallel agents in a worktree. Epic and task files live in `.claude/epics/`. Labels applied on sync are `epic`, `epic:<name>`, `feature`, `task` (`skill/ccpm/references/conventions.md`). README says no dependency on GitHub Projects.
- Overlap: closest to Atlas. It also uses GitHub issues as source of truth, comments as audit trail, and says "an agent can start a task, a human can finish it" (README, "Why GitHub Issues").
- Gaps against Atlas needs: no role labels or queues, no drift check, no Jira or ADO, in the README and conventions file. Not checked beyond those two files.
- Would drop if adopted: the PAUL phase layer and `/to-tickets`, replaced by PRD, epic, task. This replaces our planning model rather than slotting under it.
- Risk: single-author project, no tagged releases to pin to.

## BMAD Method (bmad-code-org/BMAD-METHOD)

- License: MIT, `LICENSE`, "Copyright (c) 2025 BMad Code, LLC", with a trademark notice on the BMad and BMAD-METHOD names. https://github.com/bmad-code-org/BMAD-METHOD/blob/main/LICENSE
- Maintenance: about 55k stars, last commit 2026-11-12 on the default branch, latest release v6.12.4 (2026-10-14). README says a v7 preview alpha is on the default branch with "breaking changes between updates" and gives a mid-November 2026 ETA for v7. https://github.com/bmad-code-org/BMAD-METHOD/releases
- Claude Code: the docs index mentions Claude Code among supported tools (`docs/index.md`). Install is `npx bmad-method install` (v6.12) or `npx skills add` (v7).
- Scope: a full agile process with persona agents and planning documents (briefs, specs, architecture). README: "Start anywhere", and you can "carry its briefs, specifications, and architecture into your existing delivery workflow".
- Overlap: replaces PAUL's planning (milestone, phase) and part of the mattpocock spec step.
- Gaps: tracker integration not verified (none seen in README or docs index). No role-label routing. No drift check found.
- Would drop if adopted: PAUL entirely, plus our one-spec rule. Heavy, and a v6 to v7 line change is in flight.

## GitHub Spec Kit (github/spec-kit)

- License: MIT, `LICENSE`, "Copyright GitHub, Inc." https://github.com/github/spec-kit/blob/main/LICENSE
- Maintenance: about 151k stars, last commit 2026-11-23, latest release v1.4.4 published 2026-11-23. https://github.com/github/spec-kit/releases
- Claude Code: listed as the `claude` integration. https://github.com/github/spec-kit/blob/main/docs/integrations/index.md
- Flow: `/speckit-constitution`, `specify`, `plan`, `tasks`, `implement`, `converge`. Bug fixing and idea assessment are extensions. Needs Python 3.11+ and `uv`.
- Extension model: extensions, presets, workflows, bundles, private catalogs (README, "Capabilities"). That is a real seam for Atlas adapters.
- Jira and ADO: the community catalog lists several (spec-kit-jira, spec-kit-jira-sync, spec-kit-jira-mirror, spec-kit-azure-devops, spec-kit-ado). The README says catalog listings "are not audits or endorsements". Quality, license and upkeep of each: not verified. https://github.com/github/spec-kit/blob/main/docs/community/extensions.md
- Overlap: spec, plan, tasks, implement overlap PAUL plan and mattpocock implement. `converge` is a spec-to-code check, a different thing from our plan-to-tracker drift check.
- Gaps: no role labels or queues, no handoff comments, no plan-to-tracker drift check found in the README.
- Would drop if adopted: the `/paul:plan` and `/to-tickets` flow; PAUL phases have no direct Spec Kit equivalent.

## Assessment

- None of the three covers role queues, session handoffs and the plan-to-tracker drift check. Those are the parts Atlas built and they stay.
- Phase-to-ticket linking is the only area with real competition. CCPM does it for GitHub; Spec Kit does it through optional community extensions.
- Switching planning models costs more than it saves: all three replace PAUL's milestone and phase layer, and ours already works with the drift check wired to it.
- Spec Kit fits the enterprise adapter seam best (extensions, private catalogs, Jira and ADO extensions) and has the strongest maintenance signal.

## Recommendation

Keep PAUL plus the mattpocock skills as the process core and adopt none of the three whole. For the Jira and ADO adapter, evaluate Spec Kit's extension and catalog model and its Jira or ADO extensions as a candidate; that needs a follow-up ticket to test one against `check:plan` and role labels. Borrow CCPM's idea of deterministic bash scripts for status and standup only if needed (MIT, so code can be reused).

## Not verified

- PAUL and mattpocock skills licenses and maintenance (outside the repos checked).
- Whether BMAD or CCPM integrate with Jira or ADO beyond what the README and docs index show.
- Quality, license and maintenance of the community Spec Kit Jira and ADO extensions.
- Branch `torpedo88/hardening` was read from a local checkout, not a pushed branch.
