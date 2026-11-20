#!/bin/sh
set -eu

# Vercel can isolate the docs root from the repository checkout.
if [ -n "${VERCEL_GIT_COMMIT_SHA:-}" ] && ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  history_root=$(mktemp -d)
  trap 'rm -rf "$history_root"' EXIT
  git -C "$history_root" init --quiet
  git -C "$history_root" fetch --filter=blob:none --no-tags \
    https://github.com/ComposioHQ/composio.git "$VERCEL_GIT_COMMIT_SHA"
  git -C "$history_root" update-ref HEAD FETCH_HEAD
  export DOCS_FRESHNESS_HISTORY_ROOT="$history_root"
elif [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = true ]; then
  git fetch --unshallow --no-tags origin
fi

bun run build
