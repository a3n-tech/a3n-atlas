# Updaters for every pinned tool (issue #14)

Question: can Renovate (Mend-hosted GitHub App) and/or Dependabot open update PRs for each kind of pin Atlas ships, and what does it cost in Actions minutes?

Scope note: the pin inventory was read from the current `torpedo88/hardening` checkout (not yet pushed), so line numbers may shift before it lands on `main`. Rule used throughout: every claim links to its source; anything I could not confirm is marked "not verified". Nothing here was run against a live repo, so the draft configs are untested.

## 1. Pin inventory

| # | Pin | Where | Kind |
|---|---|---|---|
| 1 | `paul-framework@1.4.0` | `skills/setup/SKILL.md:34` (`npx -y paul-framework@1.4.0 --global`) | npm package pinned inside markdown |
| 2 | `graphifyy==0.9.108` | `skills/setup/SKILL.md:49` (twice on one line, `uv tool install ... \|\| pipx install ...`) | PyPI package pinned inside markdown |
| 3 | `graphifyy==0.9.108` | `skills/setup/ci/graphify-refresh.yml:25` (`run: pip install graphifyy==0.9.108`) | PyPI package pinned inside a workflow `run:` line |
| 4 | Marketplace refs as 40-char commit SHAs: `DietrichGebert/ponytail` (`:13`), `JuliusBrussee/caveman` (`:20`, `source: git` with a URL), `alirezarezvani/claude-skills` (`:27`) | `skills/setup/project-settings.json` | git SHA refs inside JSON |
| 5 | `actions/checkout@v4`, `actions/setup-python@v5`, `python-version: "3.12"` | `skills/setup/ci/graphify-refresh.yml:21-24` | GitHub Actions tags (template, not under `.github/workflows/`) |
| 6 | `actions/checkout@v4` (x3), `actions/create-github-app-token@v2` | `skills/brain/central/.github/workflows/brain-mirror.yml:23,31`, `brain-sync.yml:30,74` | GitHub Actions tags (template path ends in `.github/workflows/`) |
| 7 | `actions/checkout@v4` | `.github/workflows/test.yml:23` | GitHub Actions tag (Atlas's own CI) |
| 8 | `dependencies`: `mattpocock-skills@claude-plugins-official`, `superpowers@claude-plugins-official` | `.claude-plugin/plugin.json` | plugin dependencies, no version constraint |
| 9 | Plugin `version` `0.8.0`, `engines.claude-code >=2.1.324` | `.claude-plugin/plugin.json` | Atlas's own version and a minimum-client constraint, not third-party pins |
| 10 | `mattpocock-skills@claude-plugins-official`, `superpowers@...`, etc. in `enabledPlugins` | `skills/setup/project-settings.json` | unpinned plugin enablement, nothing to bump |

Not found: no pins in `.github/workflows/` other than #7; `.claude-plugin/marketplace.json` carries no version or SHA pins.

Plugin dependency note: a dependency with no version constraint "moves to each new release its marketplace publishes", and only an entry with a `version` semver range is pinned ([Claude Code plugin dependencies](https://code.claude.com/docs/en/plugins/dependencies)). Our two dependencies are bare strings, so they float and there is no pin to update. If we later add `{ "name": ..., "version": "~x.y.0" }` entries, the same page says the range resolves against git tags of the dependency's marketplace.

## 2. Where each tool runs and what it costs

| | Renovate via Mend GitHub App | Dependabot |
|---|---|---|
| Runs where | Mend: "Mend hosts the infrastructure on GitHub, and users install the app on their repository" ([Mend KB: Renovate GitHub App](https://docs.mend.io/wsk/renovate-github-app)). Not our Actions runners. | GitHub runs the update jobs on Actions runners, but "Running Dependabot on standard GitHub-hosted or self-hosted runners does not count towards your included GitHub Actions minutes" ([GitHub docs source: Dependabot on Actions runners](https://github.com/github/docs/blob/main/content/code-security/concepts/supply-chain-security/dependabot-on-actions.md)). Larger hosted runners are billed at the regular rate (same page). |
| Our 2000 minutes | Not consumed (runs on Mend infra). | Not consumed on standard runners. |
| Price | Not verified on the Marketplace listing. A Renovate GitHub discussion says the app is hosted by Mend and "the free plan includes Renovate only" ([discussion 29598](https://github.com/renovatebot/renovate/discussions/29598)), a community thread, not a pricing page. | Not verified for a private org repo on Free; check Dependabot availability in repo Settings before relying on it. |
| Limits of the hosted app | No Smart Merge Control and no global (self-hosted) config ([Mend KB](https://docs.mend.io/wsk/renovate-github-app)). Repo-level `renovate.json` still applies. | n/a |

Side effect to know: Dependabot jobs run "by bypassing Actions policy checks and disablement at the repository or organization level" (Dependabot on Actions page above).

## 3. Coverage per pin kind

| Pin kind | Renovate | Dependabot |
|---|---|---|
| npm in markdown (`npx paul-framework@x`) | Yes, only via a custom regex manager: set `datasourceTemplate: npm`, capture `currentValue`, and name the package with `depNameTemplate` ([regex manager docs](https://docs.renovatebot.com/modules/manager/regex/)). The built-in `npm` manager reads package manifests, not markdown (see [manager list](https://docs.renovatebot.com/modules/manager/)). | No. Dependabot reads manifests per ecosystem (`package.json` etc.) via `directory`/`directories` ([options reference](https://github.com/github/docs/blob/main/content/code-security/reference/supply-chain-security/dependabot-options-reference.md)); that page documents no regex or custom manager. |
| pip in markdown (`graphifyy==x`) | Yes via regex manager with `datasourceTemplate: pypi` ("It can extract any `datasource`", [regex docs](https://docs.renovatebot.com/modules/manager/regex/)); the docs say you may set another version scheme "like `pep440`" (same page). | No, same reason. The `pip` ecosystem is manifest-based. |
| pip in a workflow `run:` line | Same regex manager, matched against the yml file. | No. The `github-actions` ecosystem handles `uses:` refs, not `run:` text (not verified beyond the options reference, which describes only workflow and `action.yml` scanning). |
| Git SHA refs in JSON (`project-settings.json`) | Yes via custom manager. Two routes: a regex manager capturing `currentDigest` with `datasourceTemplate: git-refs` and a `packageNameTemplate` repo URL ([git-refs datasource](https://docs.renovatebot.com/modules/datasource/git-refs/), including its "maintain the HEAD digest of the master branch" example), or the `jsonata` manager, which parses JSON and can return `currentDigest` ([jsonata manager](https://docs.renovatebot.com/modules/manager/jsonata/)). Both leave the SHA tracking the branch head, which matches how these refs are used today. | No. |
| GitHub Actions versions | Yes, built in. Default file patterns cover `workflow-templates` and `.github/workflows/*.yml` plus `action.yml`; digest pinning via `helpers:pinGitHubActionDigests` ([github-actions manager](https://docs.renovatebot.com/modules/manager/github-actions/)). It also bumps `python-version` under `actions/setup-python` (same page, `with:` table). `skills/setup/ci/graphify-refresh.yml` is outside those default patterns, so it needs an added `managerFilePatterns` entry ([managers: file matching](https://docs.renovatebot.com/modules/manager/#file-matching)). | Yes, built in as `package-ecosystem: "github-actions"`. For it, "use the value `/`" and Dependabot "will search the `/.github/workflows` directory, as well as the `action.yml/action.yaml` file from the root directory" ([options reference](https://github.com/github/docs/blob/main/content/code-security/reference/supply-chain-security/dependabot-options-reference.md)). Whether it scans `skills/brain/central/.github/workflows` via `directories`, or `skills/setup/ci/*.yml` at all: not verified (the latter is not under `.github/workflows`, so I expect it is not covered). |
| Plugin dependency versions (`plugin.json`) | No built-in manager for Claude plugin manifests (not in the [manager list](https://docs.renovatebot.com/modules/manager/)). Our deps carry no version, so there is nothing to bump today. If versioned later, a `jsonata` or regex manager with a tags datasource against the marketplace repo is plausible; not verified. | No. |
| Marketplace refs, alternative | Renovate has an `apm` manager for Microsoft APM `apm.yml` git-pinned deps ([apm manager](https://docs.renovatebot.com/modules/manager/apm/)). That is a different format from Claude's `extraKnownMarketplaces`, so it does not apply unless we adopt APM. | No. |

## 4. Findings that change the plan

1. Dependabot can only cover pin kinds 5, 6 and 7 (Actions), and only the ones under `.github/workflows`. The tool-version pins that actually drift (paul, graphify, marketplace SHAs) are outside its reach.
2. Renovate covers everything we have, but #1 to #4 need custom managers that I have not run. Budget a dry-run test pass before trusting them.
3. `graphifyy==0.9.108` appears twice on `SKILL.md:49` and once in `graphify-refresh.yml:25`. Renovate's regex docs say "To update a version string multiple times in a line: use multiple `matchStrings`, one for each occurrence" ([regex docs](https://docs.renovatebot.com/modules/manager/regex/)). Simpler: state the pin once in `SKILL.md`, or add one `# renovate:` annotation per pin and one shared regex (the "Advanced Capture" pattern on the same page).
4. Updating Atlas's templates does not update repos that already copied them. Downstream repos would need their own updater config or a re-run of `/a3ntech:setup`. Not investigated.
5. The regex manager uses RE2, which "does not support backreferences and lookahead assertions", and it matches per file, not per line ([regex docs](https://docs.renovatebot.com/modules/manager/regex/)).

## 5. Draft config (proposal, untested, not for main)

`renovate.json` at repo root:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended", "helpers:pinGitHubActionDigests"],
  "github-actions": {
    "managerFilePatterns": ["/^skills/.+/ci/.+\\.ya?ml$/"]
  },
  "customManagers": [
    {
      "customType": "regex",
      "description": "npx paul-framework@x in markdown",
      "managerFilePatterns": ["/^skills/setup/SKILL\\.md$/"],
      "matchStrings": ["paul-framework@(?<currentValue>\\d+\\.\\d+\\.\\d+)"],
      "depNameTemplate": "paul-framework",
      "datasourceTemplate": "npm"
    },
    {
      "customType": "regex",
      "description": "graphifyy==x in markdown and workflow templates",
      "managerFilePatterns": ["/^skills/setup/SKILL\\.md$/", "/^skills/setup/ci/.+\\.ya?ml$/"],
      "matchStrings": [
        "graphifyy==(?<currentValue>[0-9][0-9A-Za-z.]*)\\s+\\|\\|",
        "pipx install graphifyy==(?<currentValue>[0-9][0-9A-Za-z.]*)",
        "pip install graphifyy==(?<currentValue>[0-9][0-9A-Za-z.]*)"
      ],
      "depNameTemplate": "graphifyy",
      "datasourceTemplate": "pypi",
      "versioningTemplate": "pep440"
    },
    {
      "customType": "regex",
      "description": "marketplace commit SHAs in project-settings.json",
      "managerFilePatterns": ["/^skills/setup/project-settings\\.json$/"],
      "matchStringsStrategy": "any",
      "matchStrings": [
        "\"repo\": \"(?<depName>[^\"]+)\",\\s*\"ref\": \"(?<currentDigest>[0-9a-f]{40})\"",
        "\"url\": \"(?<packageName>https://github\\.com/[^\"]+?)(?:\\.git)?\",\\s*\"ref\": \"(?<currentDigest>[0-9a-f]{40})\""
      ],
      "currentValueTemplate": "HEAD",
      "packageNameTemplate": "https://github.com/{{{depName}}}",
      "datasourceTemplate": "git-refs"
    }
  ],
  "packageRules": [
    { "matchManagers": ["custom.regex"], "groupName": "pinned tools", "schedule": ["before 6am on monday"] }
  ]
}
```

Known gaps in the draft: `currentValueTemplate: "HEAD"` and the shared `packageNameTemplate` are my adaptation of the git-refs docs example, not tested. The caveman entry supplies a full URL through the second `matchString`, which the shared template would override; split it into its own manager if the dry run shows that. The first graphify regex needs the `||` that follows the first occurrence on `SKILL.md:49`, the second takes the `pipx` one, so the two do not overlap. Verify all of it with a local dry run (`renovate --platform=local`), which I did not do.

`.github/dependabot.yml` (covers only Actions, shown for comparison; do not run both tools on Actions):

```yaml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

Shape from [Keeping your actions up to date with Dependabot](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/auto-update-actions).

## 6. Recommendation

Use Renovate (Mend-hosted app) alone. It is the only one of the two that can reach paul, graphify and the marketplace SHAs, it runs on Mend infrastructure so it does not touch our 2000 Actions minutes, and Dependabot would only add Actions coverage that Renovate already has. Before relying on it, confirm app pricing for the org and dry-run the custom managers.

## 7. Not verified

- Mend app price for a private org on GitHub Free (only a community discussion cited).
- Dependabot availability and exact cost on a Free org's private repos.
- Whether Dependabot's `github-actions` ecosystem can scan `skills/**/ci/*.yml` or nested `.github/workflows` directories.
- That the draft regexes match and that `git-refs` with `currentValue: HEAD` resolves; no dry run was done.
- A Renovate manager for Claude plugin manifests (none found in the manager list; absence not otherwise confirmed).
