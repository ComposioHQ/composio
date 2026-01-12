#!/bin/bash
# Reusable Docker test runner for e2e tests
#
# Usage:
#   run-docker-test.sh --name <name> --dir <dir> --cmd <cmd> [--node <version>]
#
# Arguments:
#   --name, -n    Name for the Docker image (e.g., "composio-cjs-test")
#   --dir,  -d    Relative path from repo root to test directory (e.g., "ts/packages/core/test-e2e/node-cjs")
#   --cmd,  -c    Command to run (e.g., "node test.cjs", "node test.mjs", "pnpm test"). Default: "pnpm test"
#   --node        Node.js version. Default: 20.19.0
#
# Example:
#   ./run-docker-test.sh --name "composio-cjs-test" --dir "ts/packages/core/test-e2e/node-cjs" --cmd "node test.cjs" --node "20.17.0"

set -e

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
    --node)
      NODE_VERSION="$2"
      shift 2
      ;;
    *)
      echo "Error: Unknown argument '$1'"
      echo "Usage: run-docker-test.sh --name <name> --dir <dir> --cmd <cmd> [--node <version>]"
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
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"

echo "🧪 Running Docker e2e test: $TEST_NAME"
echo "   Node.js version: $NODE_VERSION"
echo "   Test directory: $TEST_DIR"
echo "   Test command: $TEST_CMD"
echo ""

echo "🐳 Building test image..."

cd "$REPO_ROOT"

# Build Docker image
docker build \
  -f "$SCRIPT_DIR/Dockerfile.node" \
  --build-arg NODE_VERSION="$NODE_VERSION" \
  --build-arg TEST_DIR="$TEST_DIR" \
  --build-arg TEST_CMD="$TEST_CMD" \
  -t "$TEST_NAME" \
  .

echo ""
echo "🧪 Running test in Docker container..."
docker run --rm "$TEST_NAME"

echo ""
echo "✅ Docker test completed successfully!"
