#!/usr/bin/env bash

set -euo pipefail

tool="${1:?usage: read-mise-lock-version.sh <tool> [mise.lock]}"
lock_file="${2:-${GITHUB_WORKSPACE:-$(pwd)}/mise.lock}"

case "$tool" in
  pnpm) section='[[tools."npm:pnpm"]]' ;;
  node|bun|python|uv) section="[[tools.$tool]]" ;;
  *)
    echo "Unsupported mise tool: $tool" >&2
    exit 1
    ;;
esac

version=$(awk -v section="$section" '
  $0 == section { found = 1; next }
  found && /^version = "/ {
    value = $0
    sub(/^version = "/, "", value)
    sub(/"$/, "", value)
    print value
    exit
  }
  found && /^\[\[/ { exit }
' "$lock_file")

if [[ -z "$version" ]]; then
  echo "Could not resolve $tool from $lock_file" >&2
  exit 1
fi

printf '%s\n' "$version"
