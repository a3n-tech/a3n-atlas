<!-- harness:role-labels:start — managed by /a3ntech:setup; edit in a3n-tech/atlas, not here -->
## Role labels — who picks up what

Every ticket carries **exactly one role label** saying which role picks it up. This applies to any tracker:
on GitHub they are labels, on Jira they are labels (or a "Role" field mapped 1:1 to these names).

| Label | Picked up by |
|---|---|
| `role:pmo` | PMO / Delivery |
| `role:pm` | Project / Product Manager |
| `role:architect` | Architect |
| `role:frontend` | Frontend developer |
| `role:backend` | Backend developer |
| `role:fullstack` | Full-stack developer (also takes unclaimed `role:frontend` / `role:backend`) |
| `role:devops` | DevOps / Platform |
| `role:release` | Release engineer |
| `role:qa` | STE / QA |

**When a skill creates or triages a ticket** (`/to-tickets`, `/triage`): apply the triage label **and**
exactly one role label — the role whose angle of attack the work needs most. A ticket spanning two
roles is usually two tickets; if it truly can't be split, pick the role that owns the riskiest part.

**Picking up:** take `ready-for-agent` tickets with your role label first (your session lists them).
Someone else's role → only if it's unassigned and you hold that role too, or the PM/PMO reassigns it.

**Reassigning** (any time the role was wrong, or load needs balancing): swap the role label — remove the
old one, add the new one — and comment why in one line. PM, PMO or the architect may reassign; anyone may
*propose* it in a comment. The assignee stays separate: the role says *what kind of work*, the assignee
says *who is doing it now*.

The drift check (`check:plan`) fails if an open `ready-for-agent` ticket has no role label or more than one.
<!-- harness:role-labels:end -->
