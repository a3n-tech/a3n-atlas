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
echo call >> "${CLAUDELOG:-/dev/null}"
[ -n "${CLAUDE_SIDE:-}" ] && sh -c "$CLAUDE_SIDE"
printf '=== HANDOFF ===\n### Done\n- x\n%b=== JOURNAL ===\n- decided y\n=== TITLE ===\nt\n' "${CLAUDE_BLOCKERS:-}"
EOF
# gh stub: issue URL is /issues/ unless GH_PR=1; brain repo private; login alice.
cat > "$T/bin/gh" <<'EOF'
#!/bin/sh
echo "$*" >> "$GHLOG"
case "$*" in
  *visibility*) echo PRIVATE ;;
  "api user"*) echo alice ;;
  "issue view"*state,url*) if [ "${GH_PR:-}" = 1 ]; then echo "OPEN https://github.com/acme/app/pull/12"; else echo "OPEN https://github.com/acme/app/issues/12"; fi ;;
  "issue view"*"--json url -q"*) echo "https://github.com/acme/app/issues/12" ;;
  "issue view"*title*) echo "t" ;;
  "project view"*) echo "PVT_1" ;;
  "project item-add"*) echo '{"id":"PVTI_1"}' ;;
  "project field-list"*) echo '{"fields":[{"id":"F1","name":"Status","options":[{"id":"O_ip","name":"In progress"},{"id":"O_bl","name":"Blocked"}]}]}' ;;
  "pr list"*) echo "" ;;
  "pr create"*) echo "https://github.com/acme/x/pull/9" ;;
  "repo clone"*) exit 1 ;;
  *) echo ok ;;
esac
EOF
chmod +x "$T/bin/"*
for i in 1 2 3 4; do echo '{"type":"user","message":{"content":"hi"}}' >> "$T/tr.jsonl"; done
export PATH="$T/bin:$PATH" GHLOG="$T/gh.log" CLAUDELOG="$T/claude.log" CLAUDE_PLUGIN_DATA="$T/data" HARNESS_BRAIN_DIR="$T/brains"

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
echo "# team hub" > index.md; mkdir -p projects/app; printf -- "---\ntype: project-hub\nrepo: acme/app\n---\n# app hub\n" > projects/app/index.md; git add -A; git commit -qm init; git push -q origin HEAD:main
# The clone claims origin https://github.com/acme/brain (what Atlas checks); insteadOf makes git use the local bare repo.
BC="$T/brains/acme/brain"; mkdir -p "$T/brains/acme"; git clone -q "$T/brain.git" "$BC"
git -C "$BC" config user.email a@a; git -C "$BC" config user.name a
git -C "$BC" config remote.origin.url https://github.com/acme/brain.git
git -C "$BC" config url."$T/brain.git".insteadOf https://github.com/acme/brain.git
touch "$BC/.git/atlas-private"   # what brain-pull writes after GitHub confirms the brain is private
cd "$T/app"

run() { mkdir -p "$T/harness-handoff-x"; echo "{\"cwd\":\"$T/app\",\"transcript_path\":\"$T/tr.jsonl\",\"session_id\":\"$1\"}" > "$T/harness-handoff-x/payload.json"; : > "$GHLOG"; node "$H/scripts/handoff-worker.mjs" "$T/harness-handoff-x/payload.json"; }

# 1. Branch switched to main while the model runs: nothing committed on main, nothing pushed to main.
echo change >> f.txt
CLAUDE_SIDE="git -C '$T/app' switch -q main" run s1
ok "no WIP commit on main after branch switch" '[ "$(git -C "$T/app" log -1 --format=%s main)" = init ]'
ok "origin main untouched" '[ "$(git --git-dir="$T/app.git" log -1 --format=%s main)" = init ]'
git switch -q 12-feat 2>/dev/null || git switch -q -f 12-feat

# 2. A secret anywhere, including in an already staged file, holds the WIP back: nothing committed or pushed.
mkdir -p gen; echo "token=ghp_$(printf 'a%.0s' $(seq 36))" > gen/leak.txt; git add gen/leak.txt; before=$(git rev-parse HEAD)
run s2
ok "staged secret: no WIP commit" '[ "$(git -C "$T/app" rev-parse HEAD)" = "$before" ]'
ok "staged secret: held-back note in handoff" 'grep -q "held back" "$GHLOG"'
ok "staged secret: person staging kept" 'git -C "$T/app" diff --cached --name-only | grep -q gen/leak.txt'
git rm -q --cached gen/leak.txt; rm -rf gen

# 2b. Clean change: WIP commit with [skip ci].
echo clean >> f.txt
run s2b
ok "WIP commit made with [skip ci]" 'git -C "$T/app" log -1 --format=%s | grep -q "skip ci"'

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
ok "brain clone still on clean main" '[ "$(git -C "$BC" branch --show-current)" = main ] && [ -z "$(git -C "$BC" status --porcelain)" ]'

# 6. Unlinked project: no journal.
git remote set-url origin https://github.com/acme/other.git
run s6
ok "unlinked repo: no journal branch" '! git --git-dir="$T/brain.git" for-each-ref refs/heads/notes/alice | grep -q s6'
git remote set-url origin https://github.com/acme/app.git

# 6b. Same repo name under another owner: the hub's repo: line does not match, so no journal.
git remote set-url origin https://github.com/someone-else/app.git
run s6b
ok "other owner, same name: no journal" '! git --git-dir="$T/brain.git" for-each-ref refs/heads/notes/alice | grep -q s6b'
git remote set-url origin https://github.com/acme/app.git

# 6c. Not a ticket branch and not linked: nowhere to write, so the model is never called.
git remote set-url origin https://github.com/acme/other.git; git switch -q -c scratch
: > "$T/claude.log"; run s6c
ok "nowhere to write: no model call" '[ ! -s "$T/claude.log" ]'
git switch -q 12-feat; git remote set-url origin https://github.com/acme/app.git

# 7. Session start reads hubs from origin/main, not the working tree.
echo "# EVIL unreviewed hub" > "$BC/projects/app/index.md"
out=$(echo "{\"cwd\":\"$T/app\"}" | HARNESS_CONFIG_DIR="$T/none" node "$H/scripts/session-start.mjs")
ok "hub from origin/main" 'printf "%s" "$out" | grep -q "app hub"'
ok "working-tree edit not injected" '! printf "%s" "$out" | grep -q EVIL'

# 8. A clone whose origin is not the brain, or without the private stamp, is never used.
# Wait for the brain-pull that session start spawned in the background, so it cannot re-stamp the clone mid-test.
for _ in $(seq 1 50); do ls "$T/data"/brain-pull-*.lock >/dev/null 2>&1 || break; perl -e "select(undef,undef,undef,0.2)"; done
git -C "$BC" checkout -q -- projects/app/index.md
rm "$BC/.git/atlas-private"
run s8
ok "no private stamp: no journal" '! git --git-dir="$T/brain.git" for-each-ref refs/heads/notes/alice | grep -q s8'
touch "$BC/.git/atlas-private"; git -C "$BC" config remote.origin.url https://github.com/evil/brain.git
out=$(echo "{\"cwd\":\"$T/app\"}" | HARNESS_CONFIG_DIR="$T/none" node "$H/scripts/session-start.mjs")
ok "wrong origin: hub not injected" '! printf "%s" "$out" | grep -q "app hub"'
git -C "$BC" config remote.origin.url https://github.com/acme/brain.git

# 9. Team board: the repo declares its project on the default branch; a handoff with blockers marks the ticket Blocked.
git -C "$T/app" stash -q -u 2>/dev/null; git -C "$T/app" switch -q main
printf '<!-- harness:team-rules:start -->\n<!-- atlas:project acme/7 -->\n' > "$T/app/CLAUDE.md"; git -C "$T/app" commit -qam project
git -C "$T/app" update-ref refs/remotes/origin/main HEAD; git -C "$T/app" switch -q 12-feat
echo blocked >> "$T/app/f.txt"
CLAUDE_BLOCKERS='### Blockers / open questions\n- waiting on the payment API key\n' run s9
ok "blockers: ticket set to Blocked on the board" 'grep -q "item-edit.*single-select-option-id O_bl" "$GHLOG"'
echo unblocked >> "$T/app/f.txt"
run s9b
ok "no blockers: ticket stays In progress" 'grep -q "item-edit.*single-select-option-id O_ip" "$GHLOG"'

echo "pass=$pass fail=$fail"; [ "$fail" = 0 ]
