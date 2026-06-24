#!/bin/bash

set -eo pipefail

# Allow bypassing the local toolchain check (useful for CI workflows using prebuilt images)
if [ -n "$BYPASS_TOOLCHAIN_CHECK" ]; then
  echo "Bypassing toolchain check (BYPASS_TOOLCHAIN_CHECK is set)"
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Checking if Bun is installed..."
if ! command -v bun &> /dev/null; then
  echo "Bun is not installed. Please install it from https://bun.sh" >&2
  exit 1
fi

echo "Bun is installed."
echo "Checking if toolchain versions match mise.toml..."
bun run "$SCRIPT_DIR/pre-install/check-toolchain.ts"
