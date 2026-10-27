#!/usr/bin/env bash
set -euo pipefail

# changesets/action v2 reads Changesets v3's NDJSON events from
# CHANGESETS_OUTPUT. Keep @composio/cli tags owned by the CLI binary workflow.
# Public SDK package tags still accompany npm publication; the SDK workflow
# disables GitHub Release creation, and Changesets does not tag private packages.

filtered_output_file=$(mktemp)
trap 'rm -f "$filtered_output_file"' EXIT

pnpm run build:packages
pnpm run check:provider-compatibility

set +e
pnpm changeset publish
status=$?
set -e

if [ -n "${CHANGESETS_OUTPUT:-}" ] && [ -f "$CHANGESETS_OUTPUT" ]; then
  jq -c 'select(.packageName != "@composio/cli")' "$CHANGESETS_OUTPUT" >"$filtered_output_file"
  mv "$filtered_output_file" "$CHANGESETS_OUTPUT"
fi

exit "$status"
