#!/usr/bin/env bash

set -euo pipefail

version='2026.8.15'

if [[ -n "${MISE_INSTALL_PATH:-}" ]]; then
  existing_binary="$MISE_INSTALL_PATH"
else
  existing_binary=$(command -v mise 2>/dev/null || true)
fi

if [[ -x "$existing_binary" ]] && [[ "$("$existing_binary" --version | awk '{print $1}')" == "$version" ]]; then
  exit 0
fi

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)
    target='linux-x64'
    checksum='a6dea05e896f1e6090f821588f45397262270e0e0b456252f8d1da28a416f3f2'
    ;;
  Linux-aarch64|Linux-arm64)
    target='linux-arm64'
    checksum='124ea8f7c8cb9a6a3c99c763cbf37ca48c9beaa816735f011d9fd99e6cd463e9'
    ;;
  Darwin-x86_64)
    target='macos-x64'
    checksum='6a1cef931e299d7392cd7008dd97fcef2d9b41fbdfe79df4fd9f7ab0cc33d9f7'
    ;;
  Darwin-arm64)
    target='macos-arm64'
    checksum='17a6e37ac2aaeee78206abc601568e1fe5010e398bf3c7320e1683584124d3c7'
    ;;
  *)
    echo "Unsupported mise platform: $(uname -s)-$(uname -m)" >&2
    exit 1
    ;;
esac

default_install_dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/mise-bin"
binary="${MISE_INSTALL_PATH:-$default_install_dir/mise}"
install_dir=$(dirname "$binary")
asset="mise-v${version}-${target}"
url="https://github.com/jdx/mise/releases/download/v${version}/${asset}"

mkdir -p "$install_dir"
curl --fail --location --retry 3 --silent --show-error --output "$binary" "$url"

if command -v shasum >/dev/null 2>&1; then
  actual_checksum=$(shasum -a 256 "$binary" | awk '{print $1}')
elif command -v sha256sum >/dev/null 2>&1; then
  actual_checksum=$(sha256sum "$binary" | awk '{print $1}')
else
  echo 'Neither shasum nor sha256sum is available to verify mise' >&2
  rm -f "$binary"
  exit 1
fi
if [[ "$actual_checksum" != "$checksum" ]]; then
  echo "Checksum mismatch for $asset" >&2
  rm -f "$binary"
  exit 1
fi

chmod +x "$binary"
if [[ -n "${GITHUB_PATH:-}" ]]; then
  echo "$install_dir" >> "$GITHUB_PATH"
fi
