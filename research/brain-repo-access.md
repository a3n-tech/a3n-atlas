# Brain repo access: fine-grained PAT or GitHub App

Research for a3n-tech/atlas#4 (map: #3). Checked against GitHub docs on 2026-11-23.

## Question

`a3n-tech/brain` (private) runs a scheduled Actions job that reads `.paul/*.md` and open issues (with `author_association`) from other private org repos. Project repos may also ping the brain to refresh. `GITHUB_TOKEN` is scoped to the repo running the workflow, so it can't do either. Which credential should we use?

## Facts that shape the answer

- **The org is on GitHub Free** (`gh api orgs/a3n-tech` reports plan `free`).
- **Org secrets don't reach private repos on Free.** "Organization-level secrets and variables are not accessible by private repositories for GitHub Free." So any credential a project repo needs for dispatch has to be copied into each repo as a repository secret.
  Source: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets#creating-secrets-for-an-organization
- **`repository_dispatch` needs Contents write, not Actions write.** "Create a repository dispatch event" needs `"Contents" repository permissions (write)`. That permission also allows pushing commits to the brain.
  Source: https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event
- **`workflow_dispatch` needs Actions write.** "Create a workflow dispatch event" works with fine-grained PATs and GitHub App installation tokens, and needs `"Actions" repository permissions (write)`. That can trigger runs but can't change brain contents, so it's the narrower option. The `actions:write` named in the ticket goes with `workflow_dispatch`, not `repository_dispatch`.
  Source: https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
- **Reading needs Contents read and Issues read.** "Get repository content" needs Contents read. "List repository issues" needs Issues read, and each issue object includes `author_association`. Metadata read is always granted.
  Sources: https://docs.github.com/en/rest/repos/contents#get-repository-content and https://docs.github.com/en/rest/issues/issues#list-repository-issues

## Option A: fine-grained PAT

| Topic | Finding |
|---|---|
| Owner | A person. The token can only reach what that person can reach, and only one resource owner (here, `a3n-tech`). |
| Org approval | By default an org owner must approve each fine-grained PAT that can access the org. Tokens created by org owners skip approval. |
| Expiry | The default org maximum lifetime for fine-grained PATs is 366 days. Owners can tighten it. Tokens over the limit get blocked, not revoked. Someone has to rotate the secret on a calendar. |
| Owner leaves | "Since a personal access token is associated with a user, your automation could break if the user no longer has access to the resources you need." |
| Rate limit | 5,000 requests per hour, shared with everything else that user does. |
| Cost | Free. |
| Dispatch | The same PAT would have to sit as a repository secret in every project repo, because of the Free plan rule above. A leak from any project repo exposes the brain-reader permissions on every repo. |

Sources:
- https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/setting-a-personal-access-token-policy-for-your-organization
- https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
- https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/reviewing-and-revoking-personal-access-tokens-in-your-organization
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app

## Option B: GitHub App owned by the org

| Topic | Finding |
|---|---|
| Owner | The org. "GitHub Apps remain installed even when the person who initially installed the app leaves the organization." It doesn't use a seat. |
| Setup | Register the App under org settings, set permissions, install it on the org (all repos or a selected list). Store the App client ID as an Actions variable and the private key as a secret. |
| Tokens in Actions | `actions/create-github-app-token@v3` with `client-id` and `private-key`. Its `owner`, `repositories` and `permission-*` inputs narrow each token. The token is revoked in the action's post step unless `skip-token-revoke` is set. Latest release v3.4.0 (2026-11-18). |
| Expiry | Installation tokens expire after 1 hour. Without `repositories` or `permissions` the token gets every repo and permission the installation has, so narrow it per job. |
| Rate limit | At least 5,000 requests per hour per installation. Above 20 repos or 20 org users it adds 50 per repo and 50 per user, up to 12,500. Our scale is far below any limit either way. |
| Cost | Free on GitHub Free and Team. Nothing in the docs ties GitHub Apps to a paid plan. |
| Rotation | Nothing to rotate on a schedule. Rotate the private key if it leaks. |

Sources:
- https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app
- https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- https://github.com/actions/create-github-app-token
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api

## Can one App do both reading and dispatch?

Technically yes. One App with Contents read, Issues read and Actions write, installed on all repos, can mint a read token in the brain job and a dispatch token in project repos, each narrowed with `repositories` and `permission-*`.

That narrowing happens per token, though, not per key. On Free, the private key has to be copied into every project repo as a repository secret. Anyone who can run a workflow in any project repo could then mint a token with the App's full grant: Actions write on every installed repo plus read on everything. That blast radius is too big for a ping.

So: **two Apps**, or one App plus no dispatch.

- **`a3n-brain-reader`**: installed on the org (all repos, or the selected project repos plus brain). Private key stored only in `a3n-tech/brain`.
- **`a3n-brain-ping`**: installed on `a3n-tech/brain` only. Its key goes into each project repo. The worst a leaked key can do is trigger brain workflows.

If a scheduled refresh is enough, skip the ping App. That saves Actions minutes too, which matters for the 2,000-minute target in #3.

## Recommendation

Use a GitHub App, not a PAT. It's free on our plan, doesn't depend on one person staying in the org, has no yearly rotation, and its tokens last an hour. The PAT only wins on setup time (about 5 minutes against about 20), and it brings a rotation date, an owner who can leave, and one secret spread across every repo.

Trigger the brain with `workflow_dispatch` (Actions write), not `repository_dispatch` (Contents write). The brain workflow needs `on: workflow_dispatch` on its default branch.

## Minimum permissions

**`a3n-brain-reader` App** (repository permissions, nothing else):
- Contents: Read
- Issues: Read
- Metadata: Read (mandatory)

Installed on: the project repos it mirrors (all repos is fine).
Token step in the brain workflow:

```yaml
- uses: actions/create-github-app-token@v3
  id: reader
  with:
    client-id: ${{ vars.BRAIN_READER_CLIENT_ID }}
    private-key: ${{ secrets.BRAIN_READER_PRIVATE_KEY }}
    owner: a3n-tech
    permission-contents: read
    permission-issues: read
```

**`a3n-brain-ping` App** (only if project repos must trigger a refresh):
- Actions: Read and write
- Metadata: Read (mandatory)

Installed on: `a3n-tech/brain` only.
Token step in a project repo, followed by a call to `POST /repos/a3n-tech/brain/actions/workflows/{workflow}/dispatches`:

```yaml
- uses: actions/create-github-app-token@v3
  id: ping
  with:
    client-id: ${{ vars.BRAIN_PING_CLIENT_ID }}
    private-key: ${{ secrets.BRAIN_PING_PRIVATE_KEY }}
    owner: a3n-tech
    repositories: brain
    permission-actions: write
```

Writes to the brain from its own jobs keep using that workflow's `GITHUB_TOKEN`.

If we use a PAT anyway: fine-grained, resource owner `a3n-tech`, selected repositories, Contents read, Issues read, Metadata read. Add Actions write only on a separate PAT limited to `a3n-tech/brain` for the ping. The lifetime is at most what org policy allows (366 days by default), and the owner should be an org owner so approval isn't needed.

## Not verified

- I didn't check the exact screens for registering an App in org settings, only the docs page linked above.
- I didn't confirm whether more than one private key can be active at once for a no-downtime key rotation.
