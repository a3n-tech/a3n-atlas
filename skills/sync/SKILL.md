---
name: sync
description: Resolve git merge, rebase and pull conflicts with AI so nobody on the team resolves them by hand — .paul/ planning files, code, lockfiles, graphify graph.json. Use this whenever a pull/merge/rebase stops on conflicts, the session-start hook or check:plan reports unresolved conflicts or merge markers, or someone says sync with main, pull main in, rebase my branch, fix the conflicts — even if they only paste a CONFLICT line from git. Not for explaining git concepts or undoing a merge.
---

# Harness sync — AI conflict resolution

Conflicts are resolved by the agent, not the person. The `.paul/` merge driver handles most
planning-file conflicts automatically; this skill handles whatever it rejected, plus code.

## 1. Get the current state

```bash
git status --short; git diff --name-only --diff-filter=U
```

No conflicts and the person asked to sync → `git fetch origin && git rebase origin/<default>`
(on a ticket branch) and continue from step 2 if it stops.

## 2. Resolve each conflicted file

For every file from `--diff-filter=U`:

1. Read all three versions: `git show :1:<f>` (base), `:2:<f>` (ours), `:3:<f>` (theirs).
2. Work out what **each side intended** — read the commit messages
   (`git log --oneline -5 ORIG_HEAD`, `MERGE_HEAD` or `REBASE_HEAD`) and linked issues.
3. Write a merge that keeps both intents:
   - `.paul/*` — keep every decision, issue reference and log row from both sides; single-value
     fields (position, status, next action) take the most advanced value.
   - Code — both behaviours must survive. If they genuinely contradict (same function, opposite
     logic), prefer the side whose ticket is newer **and** say so in the report.
   - Lockfiles — never hand-merge: take theirs, then rerun the package manager install.
   - `graphify-out/graph.json` — `graphify merge-driver` / `graphify update .`, never by hand.
4. Verify: no `<<<<<<<`/`>>>>>>>` left, file parses (run the project's typecheck/test/lint if it
   has one), then `git add <f>`.

## 3. Finish

- Merge → `git commit --no-edit`. Rebase → `git rebase --continue` (repeat step 2 per stop).
- Run the drift check (`npm run check:plan` or `node scripts/check-plan-drift.mjs`).
- Report in two or three lines: files resolved, any contradiction you had to pick a side on
  (with why). Only ask the person when two tickets truly demand opposite behaviour.
