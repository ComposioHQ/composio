#!/usr/bin/env bash

set -euo pipefail

if command -v mise >/dev/null 2>&1; then
  exit 0
fi

version='2026.5.18'

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)
    target='linux-x64'
    checksum='cfac593469d028d7ae5fe36e37bd7c59118b5238e92d8a876209578464f24a84'
    ;;
  Linux-aarch64|Linux-arm64)
    target='linux-arm64'
    checksum='3c19d4861684e4ed5b8d020bcbdd99f478df43583fb767bd8a663983d4a4e209'
    ;;
  Darwin-x86_64)
    target='macos-x64'
    checksum='c3dd600be59c1ada5aa7b178da8324f5ad40bf6a10e98d4109728d727ac9ccb9'
    ;;
  Darwin-arm64)
    target='macos-arm64'
    checksum='998428f820e22301bab9273cba8b4e59d05a40f77a9a8411d75b2de85fbb0335'
    ;;
  *)
    echo "Unsupported mise platform: $(uname -s)-$(uname -m)" >&2
    exit 1
    ;;
esac

install_dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/mise-bin"
binary="$install_dir/mise"
asset="mise-v${version}-${target}"
url="https://github.com/jdx/mise/releases/download/v${version}/${asset}"

mkdir -p "$install_dir"
curl --fail --location --retry 3 --silent --show-error --output "$binary" "$url"

actual_checksum=$(shasum -a 256 "$binary" | awk '{print $1}')
if [[ "$actual_checksum" != "$checksum" ]]; then
  echo "Checksum mismatch for $asset" >&2
  rm -f "$binary"
  exit 1
fi

chmod +x "$binary"
echo "$install_dir" >> "$GITHUB_PATH"
