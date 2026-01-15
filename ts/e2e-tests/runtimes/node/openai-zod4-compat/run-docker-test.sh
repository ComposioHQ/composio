#!/bin/bash
# OpenAI v6 + Zod v4 compatibility e2e test runner
# Verifies fix for https://github.com/ComposioHQ/composio/issues/2336

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UTILS_DIR="$SCRIPT_DIR/../../../_utils"

"$UTILS_DIR/run-docker-test.sh" \
  --name "composio-openai-zod4-compat-${NODE_VERSION}" \
  --dir "ts/e2e-tests/runtimes/node/openai-zod4-compat" \
  --cmd "node test.mjs"
