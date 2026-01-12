#!/bin/bash
# CJS compatibility e2e test runner
# Uses shared Docker test infrastructure from _utils/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UTILS_DIR="$SCRIPT_DIR/../_utils"

# Test CJS compatibility on Node.js 20.17.0
"$UTILS_DIR/run-docker-test.sh" \
  --name "composio-cjs-test-20.17" \
  --dir "ts/packages/core/test-e2e/node-cjs" \
  --cmd "node test.cjs" \
  --node "20.17.0"

# Test CJS compatibility on Node.js 20.19.0
"$UTILS_DIR/run-docker-test.sh" \
  --name "composio-cjs-test-20.19" \
  --dir "ts/packages/core/test-e2e/node-cjs" \
  --cmd "node test.cjs" \
  --node "20.19.0"
