#!/usr/bin/env bash
#
# Loud failure gate: assert one release archive carries the codex-acp layout the CLI
# actually ships — every platform's path present, but real bytes only for the platform
# this archive runs on.
#
# Both halves matter, and each guards a shipped regression:
#
#   - A missing path breaks `composio upgrade` for every CLI released before 2026-08-18.
#     Those clients verify a downloaded package against all four codex-acp paths and
#     refuse one that lacks any of them.
#   - A populated foreign binary is ~200MB nobody unpacking this archive can execute,
#     which is what made the upgrade download several minutes of mostly dead weight.
#
# The unit tests cover the packaging rules on synthetic inputs; only this gate looks at a
# real archive, so a change to the packaging pipeline cannot quietly reintroduce either
# state.
#
# Inputs (env): ARCHIVE (path to the .zip), ARTIFACT (its top-level directory),
#               HOST_CODEX_TARGET (the one target that must carry real bytes)
set -euo pipefail

: "${ARCHIVE:?ARCHIVE is required}"
: "${ARTIFACT:?ARTIFACT is required}"
: "${HOST_CODEX_TARGET:?HOST_CODEX_TARGET is required}"

# Keep in lock-step with RUN_CODEX_ACP_BINARY_TARGETS in
# ts/packages/cli/src/services/run-companion-modules.ts. Adding a codex target there must
# extend this list, or the gate stops covering it.
codex_targets=(darwin-arm64 darwin-x64 linux-arm64 linux-x64)

fail() {
  echo "::error::$1"
  exit 1
}

printf '%s\n' "${codex_targets[@]}" | grep -Fxq "$HOST_CODEX_TARGET" ||
  fail "HOST_CODEX_TARGET '$HOST_CODEX_TARGET' is not a known codex target (${codex_targets[*]})"

test -f "$ARCHIVE" || fail "archive not found: $ARCHIVE"
entries="$(unzip -Z1 "$ARCHIVE")"

for target in "${codex_targets[@]}"; do
  entry="${ARTIFACT}/acp-adapters/codex/${target}/codex-acp"

  grep -Fxq "$entry" <<<"$entries" ||
    fail "missing codex-acp entry '$entry'; pre-2026-08-18 clients refuse an archive without it"

  # Byte count of the entry as stored, read without extracting to disk.
  size="$(unzip -p "$ARCHIVE" "$entry" | wc -c | tr -d '[:space:]')"

  if [ "$target" = "$HOST_CODEX_TARGET" ]; then
    [ "$size" -gt 0 ] ||
      fail "'$entry' is this archive's own platform but is empty; the CLI cannot run an ACP sub-agent"
    echo "ok: $target carries $size bytes (this archive's platform)"
  else
    [ "$size" -eq 0 ] ||
      fail "'$entry' is a foreign platform but carries $size bytes; it can never execute here"
    echo "ok: $target is an empty placeholder"
  fi
done

echo "Archive companion layout verified for $ARTIFACT (host target: $HOST_CODEX_TARGET)."
