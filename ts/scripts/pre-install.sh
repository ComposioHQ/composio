#!/bin/bash

set -eo pipefail

# Allow bypassing the entire Bun check (useful for CI workflows using pre-built images)
if [ -n "$BYPASS_BUN_VERSION_CHECK" ]; then
  echo "Bypassing Bun version check (BYPASS_BUN_VERSION_CHECK is set)"
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Checking if Bun is installed..."
if ! command -v bun &> /dev/null; then
  echo "Bun is not installed. Please install it from https://bun.sh" >&2
  exit 1
fi

echo "Bun is installed."
echo "Checking if Bun version matches .bun-version file..."
bun run "$SCRIPT_DIR/check-bun-version.ts"
