# License audit of every dependency (issue #23)

Question: can everything Atlas depends on ship inside an open-source project?

Scope and method. Pins come from the unpushed hardening checkout (`.claude-plugin/plugin.json`, `skills/setup/project-settings.json`, `skills/setup/SKILL.md`, `skills/setup/ci/graphify-refresh.yml`, `skills/brain/**`, `.github/workflows/test.yml`). For each dependency I found the source repo, read the LICENSE file in it (at the pinned commit where there is a pin), and compared it with registry metadata. Audit date: 2026-11-23. This reports what the license text says. It is not legal advice.

Reading the columns:
- (a) Reference: Atlas names the dependency and users install it themselves. Atlas ships none of its files.
- (b) Vendor: Atlas copies the dependency's files into the Atlas repo or its release.

## Summary

| Dependency | Pin in Atlas | Source repo | License (LICENSE file) | Registry metadata | Trademark notice | (a) Reference | (b) Vendor |
|---|---|---|---|---|---|---|---|
| paul-framework | `1.4.0` (npx) | ChristopherKahler/paul | MIT | npm: MIT | none found | yes | yes, keep notice |
| graphifyy | `==0.9.108` (pip) | Graphify-Labs/graphify | Apache-2.0 (+ MIT text for earlier contributions) | PyPI: Apache-2.0 | none found | yes | yes, keep LICENSE and NOTICE |
| mattpocock-skills | marketplace sha `49dd158` | mattpocock/skills | MIT | n/a | none found | yes | yes, keep notice |
| superpowers | marketplace sha `22f0b46` | obra/superpowers | MIT | n/a | none found | yes | yes, keep notice |
| ponytail | ref `96608e0` | DietrichGebert/ponytail | MIT | n/a | none found | yes | yes, keep notice |
| caveman | ref `ef6050c` | JuliusBrussee/caveman | MIT at the pin; Apache-2.0 at current head | n/a | TRADEMARKS.md at head only | yes | pin: yes; head: yes with conditions below |
| claude-code-skills | ref `f8593c4` | alirezarezvani/claude-skills | MIT (root file) | n/a | none found | yes | root: yes; per-plugin not verified |
| frontend-design, code-review | `@claude-plugins-official` | Anthropic marketplace | not verified | n/a | not verified | yes (name only) | not verified, do not vendor |
| actions/checkout `v4`, actions/setup-python `v5`, actions/create-github-app-token `v2` | tags | actions/* | MIT | GitHub API: MIT | not checked | yes | not needed |
| gitleaks | none (code comment only) | gitleaks/gitleaks | MIT | GitHub API: MIT | not checked | yes | n/a |
| Renovate config | none in checkout | renovatebot/renovate | not read | GitHub API: AGPL-3.0 | not checked | n/a | n/a |
| qmd | none in checkout | not verified | not verified | n/a | not verified | not verified | not verified |
| ai-memory | none in checkout | not verified | not verified | n/a | not verified | not verified | not verified |

Flags:
- No dependency found without a license file, except the marketplace entries marked "not verified".
- No copyleft or source-available license among the verified dependencies. Renovate is AGPL-3.0 per GitHub metadata, but Atlas does not use it today.
- Caveman changed license between the pin and head. The pin is MIT. Head is Apache-2.0 and adds a trademark policy. Past versions were reportedly split MIT and Business Source License (see caveman section). The pin has none of the BSL directories.
- Atlas itself is proprietary today. `plugin.json` says `"license": "LicenseRef-Proprietary"` and the root `LICENSE` reads "Copyright (c) 2026 a3n-tech. All rights reserved." Opening Atlas means changing both, and that is a separate decision.

## Per dependency

### paul-framework
- Source: `npm view paul-framework repository license version` returns `git+https://github.com/ChristopherKahler/paul.git`, license `MIT`, version `1.4.0` (the pinned version).
- LICENSE first line: "MIT License" ("Copyright (c) 2026 Chris Kahler"). File read at https://github.com/ChristopherKahler/paul/blob/main/LICENSE.
- Registry and file agree. No trademark notice found in the repo root.
- (a) Yes. (b) The MIT text allows copying and redistribution if the copyright and permission notice are kept.

### graphifyy
- Source: PyPI JSON for `graphifyy` lists Repository `https://github.com/Graphify-Labs/graphify`. License expression is `Apache-2.0` for both latest (0.9.118) and the pinned 0.9.108. The legacy `license` field is empty and there are no license classifiers, so rely on the expression.
- LICENSE: Apache License, Version 2.0 (first non-blank line "Apache License"), read on branch `v8`. I did not read it at the 0.9.108 tag, so the file-level match for the exact pin is not verified. PyPI metadata for 0.9.108 says Apache-2.0.
- NOTICE first line: "Graphify" ("Copyright 2026 Safi Shamsi and the Graphify contributors."). It says portions were contributed under MIT before relicensing and the MIT text is kept in `LICENSE-MIT` (first line "MIT License").
- No trademark notice found in the repo root.
- (a) Yes. (b) Apache-2.0 allows redistribution if you include the license, keep the NOTICE, and mark changes. Pulling from PyPI at install time, as setup does, vendors nothing.

### mattpocock-skills
- Source: the `claude-plugins-official` marketplace entry (`.claude-plugin/marketplace.json`) points to `https://github.com/mattpocock/skills.git` at sha `49dd158d1076134a641b33efb035946536778336`.
- LICENSE first line at that sha: "MIT License" ("Copyright (c) 2026 Matt Pocock").
- No trademark notice found. (a) Yes. (b) Yes, keep the notice.
- Note: the marketplace sha is Anthropic's pin and moves. The plugin cache on the audit machine held version 1.3.1. Atlas lists it as a dependency by name only.

### superpowers
- Source: marketplace entry points to `https://github.com/obra/superpowers.git` at sha `22f0b463e7a5e579904dd6211a520321035526f7`.
- LICENSE first line at that sha: "MIT License" ("Copyright (c) 2025 Jesse Vincent").
- No trademark notice found. (a) Yes. (b) Yes, keep the notice.

### ponytail
- Source: `DietrichGebert/ponytail` at ref `96608e078b2d5ea607c5c3b8b5a54d1c1fba6846`.
- LICENSE first line at that ref: "MIT License" ("Copyright (c) 2026 DietrichGebert").
- No trademark notice found. (a) Yes. (b) Yes, keep the notice.

### caveman
- Source: `https://github.com/JuliusBrussee/caveman.git` at ref `ef6050c5e1848b6880ff47c32ade1a608a64f85e` (commit dated 2026-05-01).
- At the pin: root `LICENSE` first line "MIT License" ("Copyright (c) 2026 Julius Brussee"). `LICENSING.md`, `NOTICE`, `TRADEMARKS.md`, `LICENSE-MIT` do not exist at the pin (404). The pin has no `engine/` directory.
- At current head: `LICENSE` is Apache License 2.0. `LICENSING.md` says everything in the repo is Apache-2.0 "starting with Caveman 3.0.0". It says before 3.0.0 the repo was split: the skill and adoption surfaces were MIT, and the Engine-linked runtime (`engine/`, `proxy/`, `rewriter/`, `browse/`, `mcp/`, `shrink/` and others) was Business Source License 1.1 with an Additional Use Grant. Caveman Cloud is separate commercial software and not covered. Repo tags include v4.2.0, so the pin (May 2026) is older than the current line; I did not map the pin to a release tag.
- Trademark (head only, `TRADEMARKS.md`): "Caveman" name, wordmark and logo are a trademark of Julius Brussee, applications pending. It says Apache-2.0 grants no trademark rights. Accurate statements such as "works with Caveman" need no permission. Naming your own product Caveman, using the logo as your brand, or implying official affiliation needs permission.
- Registry metadata: none checked (installed from git).
- (a) Yes. Referencing by name is the nominative use the trademark file allows (head wording; the pin has no trademark file).
- (b) At the pin, the MIT text permits it with the notice kept. At head, Apache-2.0 permits it with LICENSE and NOTICE kept, but the third-party attributions in head's NOTICE (including font and GPL-with-exception items for glyph atlases) travel with some parts, and the Caveman name and logo cannot be reused as Atlas branding. If the pin is bumped, re-read LICENSING.md first, because a pre-3.0.0 range could include BSL files.

### claude-code-skills (engineering-skills, engineering-advanced-skills)
- Source: `alirezarezvani/claude-skills` at ref `f8593c4941210a621a6629ce1da9e07897976d5f`.
- Root LICENSE first line: "MIT License" ("Copyright (c) 2025 Alireza Rezvani").
- Not verified: whether the two named plugin subfolders carry their own license files or third-party content with other terms.
- (a) Yes. (b) Root MIT permits it with the notice; per-plugin terms not verified.

### frontend-design, code-review (claude-plugins-official)
- Both are enabled via the Anthropic marketplace. I did not read their sources or licenses. Not verified. Atlas only enables them by name, which is reference use. Do not vendor until read.

### GitHub Actions used in templates
- `actions/checkout@v4` and `actions/setup-python@v5`: first line "The MIT License (MIT)", "Copyright (c) 2018 GitHub, Inc. and contributors".
- `actions/create-github-app-token@v2`: "The MIT License (MIT)", "Copyright (c) 2023 Gregor Martynus".
- Used in `.github/workflows/test.yml`, `skills/brain/central/.github/workflows/*.yml`, `skills/setup/ci/graphify-refresh.yml`. These are referenced by `uses:`, never copied. Files were read on each repo's default branch, not at the tag.
- Pinning to tags rather than SHAs is a supply-chain point, not a license one.

### gitleaks
- Not a dependency today. `scripts/lib.mjs:36` has the comment "upgrade to gitleaks if the team adopts it".
- LICENSE first line: "MIT License" ("Copyright (c) 2019 Zachary Rice"), repo `gitleaks/gitleaks`.

### Renovate config
- No Renovate config exists in the checkout. The only match is the string `renovate/node-18` in a branch-name test in `scripts/selftest.mjs`.
- GitHub API reports the Renovate engine (`renovatebot/renovate`) as AGPL-3.0. I could not read its LICENSE file at the `LICENSE` path (404), so that is metadata only. A `renovate.json` config file is separate from the engine. Running the hosted app or CLI does not by itself vendor it, but if Atlas ever bundles Renovate code the AGPL terms would need a real review. Not verified beyond metadata.

### qmd and ai-memory
- Neither appears anywhere in the hardening checkout (searched all files outside `.git`). I cannot say which upstream the ticket means, so license: not verified. A repo named `tobi/qmd` exists and GitHub reports MIT, but nothing ties it to Atlas, so I do not rely on it.

## Answer to the ticket

Every verified dependency (paul-framework, graphifyy, mattpocock-skills, superpowers, ponytail, caveman, claude-code-skills root, the three GitHub Actions, gitleaks) uses a permissive license (MIT or Apache-2.0) and can be referenced by an open-source Atlas. Vendoring them is allowed if notices are kept. The open items: caveman's license and trademark change at head, per-plugin terms in claude-code-skills, the Anthropic-hosted plugins, Renovate (AGPL, unused), and qmd and ai-memory (not in the checkout). Cheapest path is to keep everything as install-time references and vendor nothing.
