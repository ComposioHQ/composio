#!/bin/sh
set -eu

# Vercel clones limited history; freshness needs each source's actual last edit.
if [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = true ]; then
  git fetch --unshallow --no-tags origin
fi

bun run build
