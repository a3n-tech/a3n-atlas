# Policy and audit: proven secret scanning and central policy

Research for a3n-tech/atlas#13 (map: #10, "adopt proven open source before building"). Checked on 2026-11-23.

## Question

Which proven tools replace the regex secret scan and local log in `scripts/lib.mjs` and `skills/brain/central/scripts/gate.sh`? Candidates: gitleaks, GitHub secret scanning and push protection on our plan, and Claude Code managed settings.

## Short answer

- **Adopt the gitleaks CLI** for the session-end WIP scan and the brain gate. MIT licensed, runs locally and in CI, and I confirmed the flags below by running it. Do not use `gitleaks-action` (separate license, key needed for orgs). Keep a small custom config, because default gitleaks missed two patterns our regex catches.
- **GitHub secret scanning and push protection are not available to us.** The org is on the Free plan, and these features on private repos need GitHub Secret Protection, which can only be bought on Team or Enterprise Cloud.
- **Claude Code managed settings do not replace any scanning code.** They can force-enable our plugin and lock marketplaces and hooks. File-based delivery has no plan requirement stated; server-managed delivery needs a Claude Team or Enterprise plan.
- **The local log (`log()` in `lib.mjs`) has no verified replacement.** I did not find a primary source for one. Not verified, left alone.

## What the current code does

Read from the working checkout at `/Users/abhishekmaharjan/orca/workspaces/harness/hardening` (branch `torpedo88/hardening` is not pushed).

- `scripts/lib.mjs`: `SECRET_RES` is eight regexes (GitHub tokens, `github_pat_`, `sk-`, `AKIA`, Slack `xox*`, PEM headers, Google `AIza`, and a generic `password|secret|api_key|token = value`). It also has `SECRET_FILE_RE` (credential-shaped filenames), `hasSecret()`, and `redact()`. A code comment already says "upgrade to gitleaks if the team adopts it". `log()` appends to `harness.log` in the data dir.
- `scripts/handoff-worker.mjs`: stages a private index, takes `git diff --cached`, and calls `hasSecret(diff)`. It also holds back on binary files and on `SECRET_FILE_RE` names. It runs `redact()` over the model-written handoff and journal text before posting.
- `skills/brain/central/scripts/gate.sh`: concatenates the full new contents of every changed file and runs one `grep -aqE` with six alternations (`gh[pousr]_`, `github_pat_`, `sk_(live|test)_`, `sk-`, `AKIA`, PEM header, `xox`). It does not have the generic `password=` rule.

## Candidate 1: gitleaks

| Item | Finding | Source |
|---|---|---|
| License | MIT (GitHub license API reports `MIT`; LICENSE file is the MIT text, "Copyright (c) 2019 Zachary Rice") | https://github.com/gitleaks/gitleaks/blob/master/LICENSE |
| Maintenance | Latest release v8.30.1, published 2026-03-21. Repo not archived. | https://github.com/gitleaks/gitleaks/releases |
| Where it runs | Local CLI, pre-commit hook, Docker, and CI. Three modes: `git`, `dir`, `stdin`. | https://github.com/gitleaks/gitleaks/blob/v8.30.1/README.md |
| Install | Homebrew, Docker, Go, or release binaries. | same README |
| Config | `--config`, then `GITLEAKS_CONFIG`, then `GITLEAKS_CONFIG_TOML`. A config can start with `[extend]` and `useDefault = true` to keep the built-in rules and add our own. | same README |

### `gitleaks-action` is a different license

`gitleaks/gitleaks-action` is not the CLI. Since v2.0.0 its license changed from MIT to its own license, and "`GITLEAKS_LICENSE` (required for organizations, not required for user accounts)". The free key comes from a form asking for name, email, and company. Our repos belong to an org, so the action would need that key.
Source: https://github.com/gitleaks/gitleaks-action/blob/master/README.md

Use the plain CLI in a workflow step instead (download a pinned release binary). The CLI is MIT and has no key.

### Flags I ran (gitleaks 8.30.1, local, synthetic secrets generated at random and never printed)

| Command | Result |
|---|---|
| `gitleaks dir --no-banner --redact <file with ghp_ token>` | exit 1 |
| same on a clean file | exit 0 |
| `gitleaks dir ... --exit-code 7 <leaky file>` | exit 7 |
| `gitleaks stdin --no-banner --redact < leaky file` | exit 1 |
| `gitleaks stdin --no-banner < clean file` | exit 0 |
| `gitleaks dir ... -f json -r report.json` | report has `RuleID`, `StartLine`, and `Secret` (`REDACTED` with `--redact`) |

Flags listed by `--help` but not executed by me: `gitleaks git --staged` ("scan staged commits"), `--pre-commit` ("scan using git diff"), `--log-opts` (passed to `git log -p`, e.g. `--log-opts="base..head"`), and `--ignore-gitleaks-allow`. I did not run the `git` mode because my sandbox blocks git commands outside the worktree. Test these in CI before relying on them.

### Detection coverage versus our regexes (default ruleset, same runs)

| Sample | gitleaks default | Our `SECRET_RES` |
|---|---|---|
| `token = ghp_<36 alnum>` | caught (`github-pat`) | caught |
| PEM private key block | caught | caught (header only) |
| `xoxb-<digits>-<alnum>` | caught | caught |
| bare `AKIA<16 chars>` | caught | caught |
| `password = "hunter2hunter2"` | **missed** | caught |
| `sk-<40 alnum>` | **missed** | caught |

So gitleaks does not strictly dominate. The two misses are probably entropy and rule-shape filters, but I did not check the rule source, so the cause is not verified. Keep those two patterns as custom rules in a `.gitleaks.toml` that extends the defaults. The reverse also holds: gitleaks ships many provider rules (hundreds, not counted here) that our eight regexes lack.

### One risk to design around

A line ending in `gitleaks:allow` is skipped by the scanner.
Source: https://github.com/gitleaks/gitleaks/blob/v8.30.1/README.md (section "gitleaks:allow")

In `gate.sh` the content is untrusted (a notes branch author writes it), so pass `--ignore-gitleaks-allow` there. The flag exists in `--help`; I did not execute it.

### What it would replace

| Current code | Replacement | Notes |
|---|---|---|
| `hasSecret(diff)` in `handoff-worker.mjs` | Pipe `git diff --cached` (private index) into `gitleaks stdin --no-banner --redact`, treat exit 1 as "held back". I ran `stdin` mode on a file, not on a diff stream. | Fail closed if the binary is missing or exits with anything other than 0 or 1, which matches the worker's existing "diff could not be read" behavior. |
| `SECRET_FILE_RE`, binary-file hold-back | Keep. | I found no verified gitleaks feature for filename rules. |
| `redact()` over model output | Keep, or scan the section with `gitleaks stdin` and drop it on a hit. | `--redact` only masks gitleaks' own output, it does not rewrite text. |
| `grep -aqE` block in `gate.sh` | `gitleaks dir "$tmp" --no-banner --redact --ignore-gitleaks-allow` over the checked-out changed files, or `gitleaks git --log-opts="$base..$head"`. Exit 1 maps to the existing "looks like it contains a secret" reason. | Check that the default rules cover Stripe `sk_live_` and `sk_test_`; I did not verify that. |
| `SECRET_RES` list | Delete, move the two uncovered patterns into `.gitleaks.toml`. | Removes the drift between `lib.mjs` and `gate.sh` (the generic rule exists in one, not the other). |

Cost of adopting: `lib.mjs` currently promises "No dependencies: node + git + gh + claude". gitleaks adds one binary on every machine and in the brain CI runner.

## Candidate 2: GitHub secret scanning and push protection

**Our plan:** `gh api orgs/a3n-tech` reports plan `free`. `a3n-tech/atlas` is private.

| Item | Finding | Source |
|---|---|---|
| Free plan, private repos | Not available. "To run the feature on your private or internal repositories, you must purchase the relevant GitHub Advanced Security product." | https://docs.github.com/en/get-started/learning-about-github/about-github-advanced-security |
| Who can buy | "You must be on a GitHub Team or GitHub Enterprise plan in order to purchase ... GitHub Secret Protection." | same page |
| What Secret Protection includes | Secret scanning, push protection, AI-detected secrets, custom patterns, delegated bypass. | same page |
| Free on any plan | Push protection for users, but only for public repositories. Partner alerts, public repos and public npm packages only. | https://docs.github.com/en/code-security/getting-started/github-security-features |
| Billing unit | License per unique active committer (a push within the last 90 days) to a repo with the feature enabled. | https://docs.github.com/en/billing/concepts/product-billing/github-advanced-security |
| Dollar price | Not verified. The billing page I read gives the unit, not a price. | n/a |
| `security_and_analysis` for atlas via API | Returned null, so I could not read current settings that way. | `gh api repos/a3n-tech/atlas` |

How it would run: server side, at push time (push protection) and on repo content (alerts). It never runs locally and cannot gate the session-end commit before the push.
What it would replace: nothing today, because we cannot enable it. If we move to Team and buy Secret Protection, it complements gitleaks (server-side backstop plus custom patterns) but does not replace the local scan, since the worker must decide before it pushes.
GitHub also offers a free risk assessment for Team or Enterprise orgs that scans for leaked secrets (same About page). Not tried.

## Candidate 3: Claude Code managed settings

| Item | Finding | Source |
|---|---|---|
| Delivery options | Server-managed (claude.ai admin console), MDM or OS policy, and a `managed-settings.json` file. | https://code.claude.com/docs/en/managed-settings |
| File paths | macOS `/Library/Application Support/ClaudeCode/managed-settings.json`, Linux and WSL `/etc/claude-code/managed-settings.json`, Windows `C:\Program Files\ClaudeCode\`. | same page |
| Plan requirement, server-managed | "available for Claude for Teams and Claude for Enterprise customers". Group-specific configs need Enterprise. | https://code.claude.com/docs/en/server-managed-settings |
| Plan requirement, file or MDM | None stated on the page. Not verified beyond that. | managed-settings page |
| Our Claude plan | Not verified. | n/a |
| Precedence | Managed settings are the highest level and user or project files cannot override them. | https://code.claude.com/docs/en/settings |
| Plugin enforcement | `enabledPlugins` (`plugin@marketplace` map, any file scope) force-enables plugins when set in managed settings. `strictKnownMarketplaces` (managed scope only) allowlists marketplace sources; an empty array blocks all, including the official one. | https://code.claude.com/docs/en/settings-reference |
| Hook lock | `allowManagedHooksOnly: true` runs only managed hooks plus hooks from plugins force-enabled in managed `enabledPlugins`. | settings-reference, `allowManagedHooksOnly` |
| Failure behavior | Invalid managed values are dropped per entry, and some keys fail closed (for example `strictKnownMarketplaces` becomes an empty allowlist). | managed-settings page |
| Known limits | A local admin can edit a file-based policy. Server-managed delivery is fetched at startup and polled hourly, with a local cache. | managed-settings page |

How it runs: inside Claude Code on each machine, not in CI.
What it would replace: nothing in `lib.mjs` or `gate.sh`. It is the "central policy" half of the question: it could make the atlas plugin mandatory and block other marketplaces. Today a repo opts in through the `<!-- harness:team-rules:start` marker in CLAUDE.md (`isHarnessRepo`), which is advisory. Managed settings would make plugin installation enforced, if we have a delivery channel (MDM or a file we can place on each machine, or a Team plan for server-managed).

## Not found or not verified

- A proven replacement for the local `harness.log`. I did not research Claude Code telemetry or GitHub audit logs for it. Not verified.
- Whether default gitleaks has a Stripe `sk_live_` rule, and why it missed the `sk-` and `password=` samples.
- `gitleaks git`, `--staged`, `--pre-commit`, `--log-opts`, and `--ignore-gitleaks-allow` behavior at runtime (documented only).
- Whether `GIT_INDEX_FILE` set in the environment is respected by `gitleaks git --staged`. I recommend `stdin` to avoid depending on it.
- GitHub Secret Protection price.
- The org's Claude plan.

## Recommendation

1. Add the gitleaks CLI to the session-end scan and `gate.sh`, with a repo `.gitleaks.toml` (`[extend] useDefault = true`) carrying the generic `password=` and `sk-` rules we currently have. Fail closed when the binary is missing.
2. In CI, download a pinned gitleaks release binary. Skip `gitleaks-action`.
3. Pass `--ignore-gitleaks-allow` in `gate.sh`.
4. Park GitHub Secret Protection until a plan change is already planned. Revisit if the org moves to Team.
5. Treat managed settings as a separate, later decision about enforcing the plugin; it does not shrink our scanning code.
