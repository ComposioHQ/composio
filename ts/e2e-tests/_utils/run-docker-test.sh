#!/bin/bash
# Reusable Docker test runner for e2e tests
#
# Usage:
#   run-docker-test.sh --name <name> --dir <dir> --cmd <cmd>
#
# Arguments:
#   --name, -n           Name for the Docker image (e.g., "composio-cjs-test")
#   --dir,  -d           Relative path from repo root to test directory (e.g., "ts/packages/core/test-e2e/node-cjs")
#   --cmd,  -c           Command to run (e.g., "node test.cjs", "node test.mjs", "pnpm test"). Default: "pnpm test"
#
# Example:
#   ./run-docker-test.sh --name "composio-cjs-test" --dir "ts/packages/core/test-e2e/node-cjs" --cmd "node test.cjs"

set -e

# Environment variables to pass through to Docker container (if set)
PASSTHROUGH_ENV_VARS=(
  "COMPOSIO_API_KEY"
  # "OPENAI_API_KEY"
)

# Default values
NODE_VERSION="20.19.0"
TEST_NAME=""
TEST_DIR=""
TEST_CMD="pnpm test"

# Parse named arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --name|-n)
      TEST_NAME="$2"
      shift 2
      ;;
    --dir|-d)
      TEST_DIR="$2"
      shift 2
      ;;
    --cmd|-c)
      TEST_CMD="$2"
      shift 2
      ;;
    *)
      echo "Error: Unknown argument '$1'"
      echo "Usage: run-docker-test.sh --name <name> --dir <dir> --cmd <cmd>"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [[ -z "$TEST_NAME" ]]; then
  echo "Error: --name is required"
  exit 1
fi

if [[ -z "$TEST_DIR" ]]; then
  echo "Error: --dir is required"
  exit 1
fi

if [[ -z "$TEST_CMD" ]]; then
  echo "Error: --cmd is required"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DEBUG_LOG="$REPO_ROOT/$TEST_DIR/DEBUG.log"

echo "🧪 Running Docker e2e test: $TEST_NAME"
echo "   Node.js version: $NODE_VERSION"
echo "   Test directory: $TEST_DIR"
echo "   Test command: $TEST_CMD"
echo "   Debug log: $DEBUG_LOG"
echo ""

cd "$REPO_ROOT"

echo ""
echo "========================================"
echo "🐳 Building and testing with Node.js $NODE_VERSION"
echo "========================================"

IMAGE_NAME="${TEST_NAME}-node${NODE_VERSION}"

docker build \
  -f "$SCRIPT_DIR/Dockerfile.node" \
  --build-arg NODE_VERSION="$NODE_VERSION" \
  --build-arg TEST_DIR="$TEST_DIR" \
  --build-arg TEST_CMD="$TEST_CMD" \
  -t "$IMAGE_NAME" \
  . # 2>&1 | tee -a "$DEBUG_LOG"

echo ""
echo "🧪 Running test in Docker container..."
echo "" >> "$DEBUG_LOG"
echo "=== Docker Run ===" >> "$DEBUG_LOG"

# Build docker run args for env vars
DOCKER_ENV_ARGS=()
for var in "${PASSTHROUGH_ENV_VARS[@]}"; do
  if [[ -n "${!var}" ]]; then
    DOCKER_ENV_ARGS+=("-e" "$var=${!var}")
  fi
done

docker run --rm "${DOCKER_ENV_ARGS[@]}" "$IMAGE_NAME" 2>&1 | tee -a "$DEBUG_LOG"
EXIT_CODE=${PIPESTATUS[0]}

echo "" >> "$DEBUG_LOG"
echo "=== Exit Code: $EXIT_CODE ===" >> "$DEBUG_LOG"

if [[ $EXIT_CODE -ne 0 ]]; then
  echo ""
  echo "❌ Docker test failed! See $DEBUG_LOG for details."
  exit $EXIT_CODE
fi

echo ""
echo "✅ Docker test passed!"
