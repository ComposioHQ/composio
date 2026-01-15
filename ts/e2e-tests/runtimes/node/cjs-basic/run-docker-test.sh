#!/bin/bash
# CJS compatibility e2e test runner
# Uses shared Docker test infrastructure from _utils/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UTILS_DIR="$SCRIPT_DIR/../../../_utils"

"$UTILS_DIR/run-docker-test.sh" \
  --name "composio-cjs-test" \
  --dir "ts/e2e-tests/runtimes/node/cjs-basic" \
  --cmd "node test.cjs"
