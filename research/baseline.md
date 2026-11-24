# Baseline: lead time and onboarding time (ticket atlas#15)

Run date: 2026-11-24 (UTC). Window: 2026-09-25 to 2026-11-24 (60 days). Org: a3n-tech, 7 repos (`gh repo list a3n-tech --limit 100`). Read-only: only `gh repo list`, GraphQL queries and GET calls were used.
Scripts: `research/baseline.py` (lead time), `research/onboarding.py` (onboarding signal), both in this folder.

## Lead time (ready-for-agent label to closing PR merged)

Definition used: first `ready-for-agent` LabeledEvent inside the window, to the earliest `mergedAt` among merged PRs in the issue's `closedByPullRequestsReferences`. Issues with no merged closing PR are counted separately and excluded from the stats.

Query (per repo, paginated 50 issues at a time, states OPEN and CLOSED):

```graphql
repository(owner:$o,name:$r){ issues(first:50,after:$c,states:[OPEN,CLOSED]){
  pageInfo{hasNextPage endCursor}
  nodes{ number state closedAt
    labeled:timelineItems(first:100,itemTypes:[LABELED_EVENT]){nodes{... on LabeledEvent{createdAt label{name}}}}
    closedByPullRequestsReferences(first:10,includeClosedPrs:true){nodes{number merged mergedAt}} } } }
```
run with `gh api graphql -f query=... -f o=a3n-tech -f r=<repo>`.

| Repo | Labeled in window | Merged closing PR (n) | Median | p25 | p75 | Min | Max | No linked merged PR |
|---|---|---|---|---|---|---|---|---|
| dhaka-topi-events | 63 | 47 | 1.5h | 0.4h | 3.7h | 0.1h | 7.5h | 16 |
| hospitality-backend | 56 | 14 | 558.2h (23.3d) | 17.2h | 581.2h | 0.5h | 596.3h | 42 |
| style-loyalty-hub | 78 | 73 | 0.5h | 0.1h | 3.4h | 0.0h | 138.3h | 5 |
| trisara | 15 | 15 | 3.7h | 3.3h | 4.8h | 0.8h | 4.9h | 0 |
| a3ntech, atlas, sunny-climate | 0 | 0 | no data | no data | no data | no data | no data | 0 |
| Overall | 212 | 149 | 2.6h (0.11d) | 0.2h | 4.8h | 0.0h | 596.3h | 63 |

Issue numbers with no linked merged PR are listed in the script output (dhaka-topi-events 16, hospitality-backend 42, style-loyalty-hub 5).

Caveats, stated plainly:
- 63 of 212 labeled issues (30%) have no linked merged PR. Their lead time is unknown ("no data"); they are not imputed. Whether they were closed without a PR, are still open, or were fixed by a PR that did not use a closing keyword is not determined here.
- hospitality-backend is bimodal and its median (23.3d) is dominated by 14 issues out of 56; do not read it as typical. The overall median is driven by dhaka-topi-events and style-loyalty-hub.
- Only the first labeling in the window is used; re-labels are ignored. A label added after the PR was already open measures only label-to-merge, not full cycle.
- `closedByPullRequestsReferences` only sees PRs linked with closing keywords or the sidebar. PRs that merged without linking are invisible.

## Onboarding time

Signal used: earliest commit on each repo's default branch history that adds a line containing `<!-- harness:team-rules:start` to `CLAUDE.md` (commits listed with `GET repos/a3n-tech/<repo>/commits?path=CLAUDE.md`, patch of each checked via `GET repos/.../commits/<sha>`), then the first PR merged after it (`GET repos/.../pulls?state=closed`, `merged_at`).

| Repo | Marker commit | First merged PR after | Gap |
|---|---|---|---|
| dhaka-topi-events | c7a308e, 2026-11-21T07:29:36Z | 2026-11-21T07:50:51Z | about 21 min |
| a3ntech, hospitality-backend, style-loyalty-hub, sunny-climate, trisara | not found | no data | no data |
| atlas | no CLAUDE.md commits | no data | no data |

What this cannot show:
- n=1. One repo has adopted the team-rules block on its default branch, so no median or spread exists.
- It does not measure a new person's onboarding (access, setup, first task). GitHub holds no event for "person joined" in these repos that was examined; no data.
- "First merged PR after the marker" is not necessarily the first real work on the harness; it may be unrelated to the harness, or the marker commit itself may have come from a PR merged earlier.
- Adoption on non-default branches, or without that marker, would not appear.
- Time to set up a new repo before the first commit is not visible.
