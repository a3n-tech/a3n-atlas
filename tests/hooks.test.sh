#!/usr/bin/env bash
# End-to-end checks for the session hooks, with stubbed gh and claude and local bare repos (no network).
# Run: bash tests/hooks.test.sh
set -uo pipefail
H="$(cd "$(dirname "$0")/.." && pwd)"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok() { if eval "$2"; then pass=$((pass+1)); printf 'PASS %s\n' "$1"; else fail=$((fail+1)); printf 'FAIL %s\n' "$1"; fi; }

mkdir -p "$T/bin" "$T/data"
# claude stub: optional side effect (CLAUDE_SIDE) runs while "the model thinks", then prints sections.
cat > "$T/bin/claude" <<'EOF'
#!/bin/sh
cat >/dev/null
[ -n "${CLAUDE_SIDE:-}" ] && sh -c "$CLAUDE_SIDE"
printf '=== HANDOFF ===\n### Done\n- x\n=== JOURNAL ===\n- decided y\n=== TITLE ===\nt\n'
EOF
# gh stub: issue URL is /issues/ unless GH_PR=1; brain repo private; login alice.
cat > "$T/bin/gh" <<'EOF'
#!/bin/sh
echo "$*" >> "$GHLOG"
case "$*" in
  *visibility*) echo PRIVATE ;;
  "api user"*) echo alice ;;
  "issue view"*state,url*) if [ "${GH_PR:-}" = 1 ]; then echo "OPEN https://github.com/acme/app/pull/12"; else echo "OPEN https://github.com/acme/app/issues/12"; fi ;;
  "issue view"*title*) echo "t" ;;
  "pr list"*) echo "" ;;
  "pr create"*) echo "https://github.com/acme/x/pull/9" ;;
  "repo clone"*) exit 1 ;;
  *) echo ok ;;
esac
EOF
chmod +x "$T/bin/"*
for i in 1 2 3 4; do echo '{"type":"user","message":{"content":"hi"}}' >> "$T/tr.jsonl"; done
export PATH="$T/bin:$PATH" GHLOG="$T/gh.log" CLAUDE_PLUGIN_DATA="$T/data" HARNESS_BRAIN_REPO=acme/brain HARNESS_BRAIN_DIR="$T/brainclone"

# Project repo with a bare push remote; origin url looks like github so repoFromUrl works.
git init -q --bare -b main "$T/app.git"
git init -q -b main "$T/app"; cd "$T/app"; git config user.email a@a; git config user.name a
printf '<!-- harness:team-rules:start -->\n' > CLAUDE.md; echo base > f.txt; git add -A; git commit -qm init
git remote add origin https://github.com/acme/app.git; git remote set-url --push origin "$T/app.git"
git push -q "$T/app.git" main
git checkout -qb 12-feat

# Brain: bare remote with a linked project; clone stays on main.
git init -q --bare -b main "$T/brain.git"
git clone -q "$T/brain.git" "$T/seed" 2>/dev/null; cd "$T/seed"; git config user.email a@a; git config user.name a
echo "# team hub" > index.md; mkdir -p projects/app; echo "# app hub" > projects/app/index.md; git add -A; git commit -qm init; git push -q origin HEAD:main
git clone -q "$T/brain.git" "$T/brainclone"; git -C "$T/brainclone" config user.email a@a; git -C "$T/brainclone" config user.name a
cd "$T/app"

run() { mkdir -p "$T/harness-handoff-x"; echo "{\"cwd\":\"$T/app\",\"transcript_path\":\"$T/tr.jsonl\",\"session_id\":\"$1\"}" > "$T/harness-handoff-x/payload.json"; : > "$GHLOG"; node "$H/scripts/handoff-worker.mjs" "$T/harness-handoff-x/payload.json"; }

# 1. Branch switched to main while the model runs: nothing committed on main, nothing pushed to main.
echo change >> f.txt
CLAUDE_SIDE="git -C '$T/app' switch -q main" run s1
ok "no WIP commit on main after branch switch" '[ "$(git -C "$T/app" log -1 --format=%s main)" = init ]'
ok "origin main untouched" '[ "$(git --git-dir="$T/app.git" log -1 --format=%s main)" = init ]'
git switch -q 12-feat 2>/dev/null || git switch -q -f 12-feat

# 2. Staged graphify-out file is never committed.
mkdir -p graphify-out; echo "token=ghp_$(printf 'a%.0s' $(seq 36))" > graphify-out/leak.txt; git add -f graphify-out/leak.txt
run s2
ok "graphify-out not in WIP commit" '! git -C "$T/app" show --name-only --format= HEAD | grep -q graphify-out'
ok "WIP commit made with [skip ci]" 'git -C "$T/app" log -1 --format=%s | grep -q "skip ci"'
git rm -q --cached --ignore-unmatch graphify-out/leak.txt; rm -rf graphify-out

# 3. Branch number is a PR, not an issue: no commit, no comment.
echo more >> f.txt; before=$(git rev-parse HEAD)
GH_PR=1 run s3
ok "PR number: no commit" '[ "$(git -C "$T/app" rev-parse HEAD)" = "$before" ]'
ok "PR number: no comment" '! grep -q "issue comment" "$GHLOG"'
git checkout -q -- f.txt

# 4. Payload: only the private dir is removed, never the caller's directory.
mkdir -p "$T/keep"; echo '{}' > "$T/keep/payload.json"; echo keep > "$T/keep/other"
node "$H/scripts/handoff-worker.mjs" "$T/keep/payload.json" 2>/dev/null
ok "caller dir survives" '[ -f "$T/keep/other" ]'

# 5. Journal: built on brain main as its own branch, clone untouched.
run s5
ok "journal pushed as notes/alice/<session>" 'git --git-dir="$T/brain.git" for-each-ref --format="%(refname)" refs/heads/notes/alice | grep -q s5'
ok "journal file under projects/app/journal" 'git --git-dir="$T/brain.git" ls-tree -r --name-only refs/heads/notes/alice/s5 | grep -q "^projects/app/journal/.*s5.md$"'
ok "journal PR opened with person token" 'grep -q "pr create -R acme/brain --base main --head notes/alice/s5" "$GHLOG"'
ok "brain clone still on clean main" '[ "$(git -C "$T/brainclone" branch --show-current)" = main ] && [ -z "$(git -C "$T/brainclone" status --porcelain)" ]'

# 6. Unlinked project: no journal.
git remote set-url origin https://github.com/acme/other.git
run s6
ok "unlinked repo: no journal branch" '! git --git-dir="$T/brain.git" for-each-ref refs/heads/notes/alice | grep -q s6'
git remote set-url origin https://github.com/acme/app.git

# 7. Session start reads hubs from origin/main, not the working tree.
echo "# EVIL unreviewed hub" > "$T/brainclone/projects/app/index.md"
out=$(echo "{\"cwd\":\"$T/app\"}" | HARNESS_CONFIG_DIR="$T/none" node "$H/scripts/session-start.mjs")
ok "hub from origin/main" 'printf "%s" "$out" | grep -q "app hub"'
ok "working-tree edit not injected" '! printf "%s" "$out" | grep -q EVIL'

echo "pass=$pass fail=$fail"; [ "$fail" = 0 ]
