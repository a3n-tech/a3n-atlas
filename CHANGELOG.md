# Changelog

## 0.9.0

- Team visibility: a repo can declare its GitHub Project in `CLAUDE.md` (`<!-- atlas:project <owner>/<number> -->`, read from the default branch). Session start puts the ticket on the board as In progress; session end sets Blocked when the handoff lists blockers. Uses the person's own `gh` token (`gh auth refresh -s project` once), no Actions minutes.
- gitleaks: the session-end WIP scan also runs gitleaks when it is installed, and the brain gate installs a pinned, checksum-verified gitleaks in CI. Both use `.gitleaks.toml` (defaults plus rules for assigned passwords and `sk-` keys). The regex scan still runs.
- Renovate config (`renovate.json`): weekly grouped PR for the PAUL version, marketplace commit pins and GitHub Actions; never automerged, so third-party pins are reviewed. Needs the Renovate app installed on the repo.
- `/a3ntech:setup` ends with one checklist and records when setup finishes (`~/.config/atlas/onboarding.log`, local only) so onboarding time can be measured.
- Per-person settings move to `~/.config/atlas`; `~/.config/a3n-harness` is still read and `/a3ntech:role` moves it.
- Actions: `actions/checkout` v7 and `actions/create-github-app-token` v3; brain App variables are now `BRAIN_READER_CLIENT_ID` / `BRAIN_DISPATCH_CLIENT_ID` (the App's Client ID).
- Neutral wording for other orgs in docs and the plugin description.

## 0.8.1

- Token budget: the team rules block injected into every session is 2,957 characters instead of 6,582 (how the automation works moved to `docs/HARNESS-SETUP.md`); skill descriptions total 1,358 characters instead of 2,770, and the trigger evals still pass 16 of 16 on Sonnet.
- Session end: no model call when there is nowhere to write (not a ticket branch with an open issue in a private repo, and no linked brain); the transcript sent to the model is capped at 20,000 characters instead of 60,000.
- `mattpocock-skills` is a repo pin again, not a plugin dependency: a dependency that cannot be installed stopped Atlas loading at all, which also kept the trigger evals from ever firing.

## 0.8.0

- Which brain a repo uses is committed config, never a personal setting: `<!-- atlas:brain owner/name -->` in `CLAUDE.md` on the repo's default branch (outside the managed block; read from `origin`, never the working tree), else `<owner>/brain`. The `brain_repo` option is gone.
- One clone per brain (`<base>/<owner>/<name>`). A clone is used only if its configured origin is that brain and `brain-pull` last confirmed it private or internal, so an untrusted repo can never point a team repo's journals or context at another brain.
- Mirror skips hubs that name an owner outside `BRAIN_PROJECT_OWNERS` (default: the brain's owner) and the template placeholder.
- Docs and rules match the code: branch types, per-session notes branches, "brain" and hub terms in the glossary, secret patterns aligned between the gate and the hooks.
- MIT license. Repo renamed to `a3n-tech/a3n-atlas`.
- The brain no longer has to share an owner with its projects. A project counts as linked only when its reviewed hub on the brain's main says `repo: <owner>/<name>` and that matches the repo's origin exactly; the mirror reads the repo to mirror from that same line. The default brain is `<owner>/brain` for the project repo's owner instead of a fixed org.
- Review fixes: the WIP commit and push only happen if HEAD is still the session's branch, and push that branch by name; no folder is excluded from the WIP secret scan any more (a staged file under `graphify-out/` used to be committed unscanned); a branch number that is a PR is skipped; only an open PR is reused; the payload cleanup removes only its own temp folder; a second session end waits for the first instead of being dropped (pid lock, shared across worktrees).
- Journals are built on the brain's main as one commit each, on their own branch `notes/<login>/<session>` with their own PR, and only for linked projects. The local brain clone stays on main and only fast-forwards; session start reads hubs and journal names from `origin/main`. This removes the shared notes branch and its races.
- Brain gate: accepts `notes/<login>/...` branches and deletes them after merging; no longer fetches the PR head (failed on private repos); rejects `CLAUDE.local.md`, `AGENTS.override.md` and similar. Mirror no longer fails when a glob matches nothing.
- Ticket branches also accept `feature/`, `bugfix/`, `task/` and `story/` prefixes. The drift checker accepts `#5–#18` without spaces and warns about hyphen ranges.
- Brain clone uses `gh repo clone` (follows https or ssh). Removed graphify (hooks, CI workflow, committed graph; setup removes them from repos) and unpinned `superpowers`, `engineering-skills` and `engineering-advanced-skills`: they duplicated the flow PAUL and the mattpocock skills own. Role lenses point at installed skills only. The README carries a short pointer; setup detail moved to `docs/HARNESS-SETUP.md`. Install docs say to uninstall the old `harness` plugin.
- Brain gate runs on `pull_request_target`, so the workflow and `gate.sh` always come from main, never from the change being checked; fork PRs are ignored. Agents open the notes PR with the person's own token.
- Renamed the product to Atlas. Plugin id is `a3ntech`, commands are `/a3ntech:*`, repo is `a3n-tech/a3n-atlas`.
- Brain: one org repo `a3n-tech/brain` with `projects/<repo-name>/`, replacing per-repo `brain/`. Local clone kept current at session start; `/a3ntech:brain` bootstraps, links and migrates.
- Session-end handoff guards: nothing runs during a merge, rebase or cherry-pick; strict ticket branch names; the issue must exist and be open; private index; `[skip ci]` on WIP commits; parseable output; lock; private payload file.
- Session start runs its `gh` calls in parallel and escapes handoff text.
- Brain gate: fixed the secret scan under `pipefail`, added a type-change scan, fixed fan-out.
- Drift checker fails closed on `gh` errors (exit 2), caps expanded ranges at 100, and honors the issue list limit.
- Separate concurrency groups for bot workflows.
- Dropped Obsidian and the notes fan-out: people edit the brain on GitHub, agents through the local clone.
- Plugin `userConfig` (`handoff`, `brain_dir`).
- New setup step "CI budget": reviews workflows to cut Actions minutes.
