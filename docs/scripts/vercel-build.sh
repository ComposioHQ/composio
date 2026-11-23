#!/bin/sh
set -eu

# Vercel clones limited history; freshness needs each source's actual last edit.
if [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = true ]; then
  git fetch --unshallow --no-tags origin
fi

if [ "${VERCEL_ENV:-production}" = production ]; then
  COMPOSIO_STABLE_REFERENCE_DIR="$PWD/.stable-reference"
  export COMPOSIO_STABLE_REFERENCE_DIR
  rm -rf "$COMPOSIO_STABLE_REFERENCE_DIR"
  mkdir "$COMPOSIO_STABLE_REFERENCE_DIR"
  bun scripts/sdk-reference-snapshot.ts prepare "$COMPOSIO_STABLE_REFERENCE_DIR"
fi

bun run build
