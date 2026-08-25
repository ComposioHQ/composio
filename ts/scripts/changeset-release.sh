#!/usr/bin/env bash
set -euo pipefail

# changesets/action v2 reads Changesets v3's NDJSON events from
# CHANGESETS_OUTPUT. The CLI binary workflow owns @composio/cli GitHub Releases
# because those releases must include platform binary assets. Remove only that
# package's git-tag event so changesets/action publishes and releases every
# other package without creating an empty @composio/cli GitHub Release.

filtered_output_file=$(mktemp)
trap 'rm -f "$filtered_output_file"' EXIT

pnpm run build:packages

set +e
pnpm changeset publish
status=$?
set -e

if [ -n "${CHANGESETS_OUTPUT:-}" ] && [ -f "$CHANGESETS_OUTPUT" ]; then
  jq -c 'select(.packageName != "@composio/cli")' "$CHANGESETS_OUTPUT" >"$filtered_output_file"
  mv "$filtered_output_file" "$CHANGESETS_OUTPUT"
fi

exit "$status"
