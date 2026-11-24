# Changelog

## 0.8.0

- Brain gate runs on `pull_request_target`, so the workflow and `gate.sh` always come from main, never from the change being checked; fork PRs are ignored. Agents open the notes PR with the person's own token.
- Renamed the product to Atlas. Plugin id is `a3ntech`, commands are `/a3ntech:*`, repo is `a3n-tech/atlas`.
- Central brain: one org repo `a3n-tech/brain` with `projects/<repo-name>/`, replacing per-repo `brain/`. Local clone kept current at session start; `/a3ntech:brain` bootstraps, links and migrates.
- Session-end handoff guards: nothing runs during a merge, rebase or cherry-pick; strict ticket branch names; the issue must exist and be open; private index; `[skip ci]` on WIP commits; parseable output; lock; private payload file.
- Session start runs its `gh` calls in parallel and escapes handoff text.
- Brain gate: fixed the secret scan under `pipefail`, added a type-change scan, fixed fan-out.
- Drift checker fails closed on `gh` errors (exit 2), caps expanded ranges at 100, and honors the issue list limit.
- Separate concurrency groups for bot workflows.
- Dropped Obsidian and the notes fan-out: people edit the brain on GitHub, agents through the local clone.
- Plugin `dependencies` (`mattpocock-skills`, `superpowers`) and `userConfig` (`handoff`, `brain_repo`, `brain_dir`).
- New setup step "CI budget": reviews workflows to cut Actions minutes.
