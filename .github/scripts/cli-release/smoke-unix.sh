#!/usr/bin/env bash
#
# Smoke-tests one macOS or Linux release archive on a machine of its own platform:
# the extracted bundle, not the raw build output, so the executable runs next to the
# companion modules and release tag it ships with. Windows has its own native check,
# test-windows.ps1.
#
# The checks cover what a bytecode build could break at startup or in the
# companions: the baked version, help rendering, a parse failure's exit code,
# `composio run` inline and from a file, and that the executable carries bytecode
# (an executable without it records an empty profile).
#
# Inputs (env): ARCHIVE (path to the .zip), ARTIFACT (its top-level directory),
# EXPECTED_VERSION (the version `composio --version` must print)
set -euo pipefail

: "${ARCHIVE:?ARCHIVE is required}"
: "${ARTIFACT:?ARTIFACT is required}"
: "${EXPECTED_VERSION:?EXPECTED_VERSION is required}"

fail() {
  echo "::error::$1"
  exit 1
}

archive="$(cd "$(dirname "$ARCHIVE")" && pwd)/$(basename "$ARCHIVE")"
root="$(mktemp -d)/composio smoke"
mkdir -p "$root/home"
trap 'rm -rf "$(dirname "$root")"' EXIT
unzip -q "$archive" -d "$root"
cli="$root/$ARTIFACT/composio"
test -x "$cli" || fail "$ARTIFACT/composio is missing or not executable"

# The executable acts as Bun itself under BUN_BE_BUN, and BUN_OPTIONS adds runtime flags.
unset BUN_BE_BUN BUN_OPTIONS BUN_BYTECODE_ORDER_OUT
export HOME="$root/home"
export COMPOSIO_CACHE_DIR="$root/home/.composio"
export COMPOSIO_DISABLE_TELEMETRY=1
export COMPOSIO_USER_API_KEY=test-dummy-api-key-for-ci
cd "$root"

actual_version="$("$cli" --version)"
test "$actual_version" = "$EXPECTED_VERSION" ||
  fail "composio --version printed '$actual_version', expected '$EXPECTED_VERSION'"

for args in '--help' 'execute --help' 'run --help'; do
  # shellcheck disable=SC2086 # each entry is a word list
  "$cli" $args >/dev/null || fail "composio $args failed"
done

set +e
parse_output="$("$cli" definitely-not-a-command 2>&1)"
parse_exit=$?
set -e
test "$parse_exit" -eq 1 || fail "an unknown subcommand exited $parse_exit, expected 1"
grep -Fq 'Unknown subcommand' <<<"$parse_output" || fail "an unknown subcommand printed: $parse_output"

inline_output="$("$cli" run 'console.log("smoke-inline-ok")')"
test "$inline_output" = 'smoke-inline-ok' || fail "composio run (inline) printed: $inline_output"

script_file="$root/script with spaces.ts"
echo 'console.log("smoke-file-ok");' >"$script_file"
file_output="$("$cli" run --file "$script_file")"
test "$file_output" = 'smoke-file-ok' || fail "composio run --file printed: $file_output"

BUN_BYTECODE_ORDER_OUT="$root/profile.order" "$cli" --version >/dev/null
functions="$(grep -c '^F ' "$root/profile.order" || true)"
test "$functions" -gt 0 || fail "the executable carries no bytecode (its profile recorded no functions)"

echo "$ARTIFACT: version, help, parse failure, run, and bytecode ($functions functions at startup) passed."
