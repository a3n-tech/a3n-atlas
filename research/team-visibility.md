# Team visibility: existing tools for who works on what and blockers

Ticket: a3n-tech/atlas#25 (map #10: adopt existing tools before building). Researched 2026-11-24. Read-only: nothing was created in any a3n-tech repo or project.

## Answer

Use one GitHub Project (organization level) as the single place to look. Each person's session-start and session-end hooks write to it with their own `gh` token. No GitHub Actions are needed, so the cost is 0 Actions minutes. The Slack `/standup` command is not a team digest and does not replace the board.

## Findings

### GitHub Projects on the Free plan

- Projects is listed as "Included" on the Free, Team and Enterprise columns of the pricing comparison. Source: https://github.com/pricing
- The plans page says Free organizations get "unlimited private repositories with a limited feature set" and does not list Projects among the limits. Source: https://docs.github.com/en/get-started/learning-about-github/githubs-plans
- Not verified: no page found that states in one sentence that an org project can hold issues from private repos on Free. The two pages above point that way; the first real board will confirm it.
- A project is a table, board and roadmap at user or organization level, built from issues and pull requests, with custom fields and saved views. Source: https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects
- Fields: up to 50 per project, built-in plus custom. Custom types listed: date, number, single select, text, iteration. Same source.
- Items: a project holds at most 50,000 items across views and archive. Source: https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-items-in-your-project/adding-items-to-your-project
- Changes sync both ways between project and issue (for example assignee). Same About page.

### Built-in automation versus Actions

- Built-in workflows set Status on events (item added, closed, merged). Two are on by default: closed items and merged PRs become Done. Source: https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations
- Auto-add pulls items from a repo that match a filter (`is`, `label`, `reason`, `assignee`, `no`). Each auto-add workflow targets one repository. Source: https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/adding-items-automatically
- Limit that matters: GitHub Free allows 1 auto-add workflow (Pro and Team 5). Same source. With 7 repos in the org (atlas, hospitality-backend, dhaka-topi-events, style-loyalty-hub, trisara, a3ntech, sunny-climate; all private, via `gh repo list`), auto-add covers one repo only. The rest must be added by the hook.
- GitHub documents Actions as a separate route; `GITHUB_TOKEN` "is scoped to the repository level and cannot access projects", so an Action needs a GitHub App or PAT. Source: https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/automating-projects-using-actions
- Not verified: whether built-in project workflows count against Actions billing. The docs present them as a Projects feature, separate from Actions, and the Actions billing page covers runner usage only. Treated as 0 but unconfirmed.

### Updating an item with the person's own token

- GraphQL: `addProjectV2ItemById` adds an issue; `updateProjectV2ItemFieldValue` with `singleSelectOptionId` sets a Status. Scopes: `read:project` for queries, `project` for mutations. Source: https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects
- CLI: `gh project item-add <number> --owner <org> --url <issue-url>` and `gh project item-edit --id <item> --project-id <proj> --field-id <field> --single-select-option-id <opt>`. Sources: https://cli.github.com/manual/gh_project_item-add , https://cli.github.com/manual/gh_project_item-edit
- Observed locally (not from docs): the current `gh` login has scopes `gist, read:org, repo, workflow`, and `gh project list --owner a3n-tech` fails with "missing required scopes [read:project]". Each person must run `gh auth refresh -s project` once. The org plan reads as `free` from the API.
- Item and field ids are needed for `item-edit`. They can be read once with `gh project field-list` and `gh project item-list` and cached; those commands were not exercised here (no project exists).

### Labels

- A `blocked` label per repo is plain GitHub issues, no cost. The auto-add filter accepts `label`, and a project view can filter on a label, so the label can feed a Blocked view. Source: auto-add page above (filter list); view filtering by label not separately verified.
- Labels do not exist yet in the repos; creating them was out of scope.

### Slack standup

- The Slack plugin command `/slack:standup` (plugin `slack` 1.4.1, local file `commands/standup.md`) builds one person's Done / Doing / Blockers from that person's own recent public Slack messages and shows it for review. It does not read GitHub, repos or other people, and it posts only if the user asks. So it is a personal helper, not a cross-repo digest.
- Not verified: whether Slack's own docs describe it. The command text was read directly. A team digest would need a scheduled job reading the board and posting; that is a separate decision.

### Today's Atlas pieces and what maps where

| Atlas piece | Maps to |
|---|---|
| Handoff comment (Done / In progress / Next step / Blockers), `scripts/handoff-worker.mjs` on `origin/torpedo88/hardening` | Source of truth for blockers; the hook sets Status and the `blocked` label from the Blockers section |
| Draft PR per ticket branch | Linked to the issue; merge sets Done (built-in) |
| Brain mirror daily ticket index per repo | Keep for notes; the board becomes the cross-repo view |
| Per-person role queue | Board view filtered by assignee and role label |

## Proposal

Single place to look: one org Project "Atlas" with a board view grouped by Status (Todo, In progress, Blocked, Done) and filters by assignee and repo.

What writes to it:

1. Session start hook (person's token): `gh project item-add --url <issue>` for the ticket they pick, set Status to In progress, assign self.
2. Session end hook, in the handoff worker (person's token): if Blockers is non-empty, add the `blocked` label and set Status to Blocked; otherwise keep In progress. The draft PR merge sets Done.
3. Built-in workflows: keep the two defaults (closed and merged to Done). Use the one free auto-add slot for the busiest repo.
4. One-time setup per person: `gh auth refresh -s project`.

Daily digest, optional: each person runs `/slack:standup` for their own update. A team digest from the board is not proposed now.

Estimated Actions minutes: 0 per month. Nothing runs in Actions. The current docs state the Free org's included compute as $12 per month, in dollars, not minutes (Linux 2-core is $0.006 per minute, about 2,000 minutes if all of it went to that runner; my arithmetic). The "2000 minutes" in the brief is not stated in the current docs. Source: https://docs.github.com/en/billing/concepts/product-billing/github-actions

## Risks

- Hooks that fail (no `project` scope, offline) must not block the session; log and continue.
- If Projects does not accept private-repo issues on Free as expected, the fallback is the `blocked` label plus `gh issue list` per repo (not verified, not needed unless the first board fails).
- A hook writing with a person's token acts as that person; keep writes to Status, label and assignee only.
