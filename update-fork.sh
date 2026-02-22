#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Ensure remotes are configured correctly
check_remote() {
  local name="$1"
  local expected="$2"
  local actual
  actual=$(git remote get-url "$name" 2>/dev/null || true)
  if [[ -z "$actual" ]]; then
    echo "Adding remote '$name' -> $expected"
    git remote add "$name" "$expected"
  elif [[ "$actual" != "$expected" ]]; then
    echo "ERROR: Remote '$name' exists but URL mismatches:"
    echo "  expected: $expected"
    echo "  actual:   $actual"
    exit 1
  fi
}

check_remote origin "git@github.com:TimoFreiberg/pi-mono.git"
check_remote upstream "git@github.com:badlogic/pi-mono.git"

echo "Fetching upstream..."
jj git fetch --remote upstream

echo "Rebasing fork on upstream/main..."
jj rebase -b fork -d main@upstream

# Abort if rebase introduced conflicts
CONFLICT_COUNT=$(jj log --no-graph -r 'fork::' -T 'if(conflict, "C")' 2>/dev/null | wc -c | tr -d ' ')
if [[ "$CONFLICT_COUNT" -gt 0 ]]; then
  echo ""
  echo "ERROR: Rebase introduced conflicts. Resolve them before continuing."
  echo "Conflicting commits:"
  jj log -r 'fork:: & conflict()'
  exit 1
fi

# Check if fork has diverged from origin after rebase
FORK_REV=$(jj log --no-graph -r 'fork' -T 'commit_id' 2>/dev/null || true)
FORK_ORIGIN_REV=$(jj log --no-graph -r 'fork@origin' -T 'commit_id' 2>/dev/null || true)
if [[ -n "$FORK_REV" && -n "$FORK_ORIGIN_REV" && "$FORK_REV" != "$FORK_ORIGIN_REV" ]]; then
  echo ""
  echo "NOTE: 'fork' has diverged from 'fork@origin' after rebase."
  echo "  You may want to push with: jj git push --bookmark fork"
  echo ""
fi

echo "Installing dependencies..."
npm install

echo "Building all packages..."
npm run build

echo "Linking pi globally..."
cd packages/coding-agent
npm link

echo "Done. Run 'pi' to start."
