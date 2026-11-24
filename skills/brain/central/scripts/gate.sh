#!/usr/bin/env bash
# Auto-merge gate for notes branches. Run inside a git checkout.
#   scripts/gate.sh <base-sha> <head-sha> <branch> <actor>
# Prints every reason a change is not auto-mergeable. Exit codes:
#   0 mergeable   1 rejected (needs a normal reviewed PR)   3 nothing to merge   2 bad usage
set -eo pipefail
[ "$#" -eq 4 ] || { echo "usage: gate.sh <base> <head> <branch> <actor>" >&2; exit 2; }
base=$1 head=$2 branch=$3 actor=$4
lc() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# Your own branch only: notes/<login> (hand edits) or notes/<login>/<anything> (one per agent session).
b=$(lc "$branch") a=$(lc "$actor")
if [ "$b" != "notes/$a" ] && [[ "$b" != "notes/$a/"* ]]; then
  echo "Auto-merge only for your own branches notes/$actor or notes/$actor/... (pushed $branch). Open a normal PR instead."
  exit 1
fi

bad=""; n=0
# Case-insensitive: macOS filesystems fold case, so Projects/X/INDEX.MD is projects/x/index.md.
shopt -s nocasematch
protected='^(index\.md(/.*)?|projects/[^/]+/index\.md(/.*)?|projects/[^/]+/plan/.*|projects/[^/]+/tickets/.*|project-template/.*|scripts/.*|\.github/.*)$'
# Also CLAUDE.local.md, AGENTS.override.md and similar variants: agents load those as instructions too.
agentfile='(^|/)(claude|agents|gemini|skill|copilot-instructions)(\.[a-z0-9_-]+)?\.md$'
# --raw -z: ":oldmode newmode oldsha newsha status\0path\0". No rename detection: a rename is delete+add.
while IFS= read -r -d '' meta && IFS= read -r -d '' f; do
  n=$((n+1))
  newmode=$(printf '%s' "$meta" | cut -d' ' -f2)
  case "$newmode" in
    100644|000000) ;;   # regular file, or deletion
    *) bad="$bad$f (mode $newmode: symlinks, executables and submodules need a reviewed PR)"$'\n'; continue ;;
  esac
  # Paths reach agent context (file listings), so only plain characters: no newlines, quotes, brackets or "<".
  if [[ ! $f =~ ^[A-Za-z0-9._\ /-]+$ ]]; then
    bad="${bad}$(printf '%q' "$f") (file names may use letters, digits, space, dot, dash, underscore and /)"$'\n'; continue
  fi
  if [[ $f =~ $protected ]] || [[ $f =~ (^|/)\. ]] || [[ $f =~ $agentfile ]]; then
    bad="$bad$f (protected: hubs, generated mirrors, scripts, CI, dot-paths and agent-instruction files need a reviewed PR)"$'\n'
  elif [[ $f =~ \.(md|png|jpg|jpeg|gif|webp|pdf)$ ]]; then
    :
  else
    bad="$bad$f (not a note or image)"$'\n'
  fi
done < <(git diff --raw -z --no-renames "$base" "$head")
shopt -u nocasematch

[ "$n" -eq 0 ] && { echo "nothing to merge"; exit 3; }

# Secret scan: full new contents of everything except deletions (includes type changes).
# Patterns: keep in sync with SECRET_RES in the plugin's scripts/lib.mjs (Node there, so this cannot import it).
# Write to a file and grep the file. Piping into `grep -q` makes grep exit early, the writer dies of
# SIGPIPE, and pipefail then reports the scan as clean.
tmp=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/gate.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
while IFS= read -r -d '' f; do
  git show "$head:$f" >> "$tmp/contents" 2>/dev/null || true
  printf '\n' >> "$tmp/contents"
done < <(git diff --name-only -z --no-renames --diff-filter=d "$base" "$head")
if [ -f "$tmp/contents" ] && grep -aqE '(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|sk_(live|test)_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY|xox[abpors]-)' "$tmp/contents"; then
  bad="${bad}A changed file looks like it contains a secret. Remove it, store secrets in the password manager, and push again."$'\n'
fi
# gitleaks with the repo's .gitleaks.toml when it is installed (CI installs it); the regex above always runs too.
cfg="$(cd "$(dirname "$0")/.." && pwd)/.gitleaks.toml"
if [ -f "$tmp/contents" ] && command -v gitleaks >/dev/null 2>&1; then
  grc=0; gitleaks dir "$tmp" -c "$cfg" --no-banner --redact --exit-code 5 >/dev/null 2>&1 || grc=$?
  if [ "$grc" = 5 ]; then
    bad="${bad}gitleaks found a secret in a changed file. Remove it and push again."$'\n'
  elif [ "$grc" != 0 ]; then
    bad="${bad}gitleaks could not run (exit $grc); a reviewed PR is needed."$'\n'
  fi
fi

if [ -n "$bad" ]; then
  printf '%s' "$bad"
  exit 1
fi
exit 0
