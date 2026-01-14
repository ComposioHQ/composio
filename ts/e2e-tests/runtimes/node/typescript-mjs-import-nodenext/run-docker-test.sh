#!/bin/bash
# TypeScript .mjs import resolution e2e test runner
# Uses shared Docker test infrastructure from _utils/
#
# Requires COMPOSIO_API_KEY environment variable to be set
# Tests with Node.js 20.18.0 and 20.19.0 using nvm

set -e

if [[ -z "$COMPOSIO_API_KEY" ]]; then
  echo "Error: COMPOSIO_API_KEY environment variable is required"
  echo "Export it before running: export COMPOSIO_API_KEY=your_key"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UTILS_DIR="$SCRIPT_DIR/../../../_utils"

# Test with both Node.js 20.18.0 and 20.19.0
NODE_VERSIONS="${COMPOSIO_E2E_NODE_VERSIONS:-20.18.0 20.19.0}"

"$UTILS_DIR/run-docker-test.sh" \
  --name "composio-typescript-mjs-import-nodenext" \
  --dir "ts/e2e-tests/runtimes/node/typescript-mjs-import-nodenext" \
  --cmd "node test.mjs" \
  --node-versions "$NODE_VERSIONS"
