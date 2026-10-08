#!/usr/bin/env bash
#
# Loud failure gate: assert one release archive carries the companion layout the CLI
# actually ships — the legacy paths present but empty, the live bundles present with
# real bytes.
#
# Each check guards a different failure:
#
#   - A missing legacy path breaks `composio upgrade` for every stable CLI from 0.2.12
#     to 0.4.2. Those clients verify a downloaded package against their own path list,
#     by existence only, and refuse one that lacks any of them.
#   - A legacy path with content means sub-agent or adapter code is shipping again. The
#     helper it served was removed; the path is only a placeholder.
#   - An empty live bundle passes every existence check and still breaks `composio run`
#     and `composio generate`. The root files of the same name are one-line re-export
#     wrappers, so the bundles under services/ are what carries the code.
#
# The unit tests cover the packaging rules on synthetic inputs; only this gate looks at a
# real archive, so a change to the packaging pipeline cannot quietly reintroduce any of
# these states.
#
# Inputs (env): ARCHIVE (path to the .zip), ARTIFACT (its top-level directory)
set -euo pipefail

: "${ARCHIVE:?ARCHIVE is required}"
: "${ARTIFACT:?ARTIFACT is required}"

# Keep in lock-step with RUN_COMPANION_LEGACY_PLACEHOLDER_RELATIVE_PATHS in
# ts/packages/cli/src/services/run-companion-modules.ts. The list is frozen: it is what
# already-released clients ask for.
legacy_placeholders=(
  run-subagent-shared.mjs
  run-subagent-acp.mjs
  run-subagent-legacy.mjs
  run-subagent-output-mcp.mjs
  acp-adapters/claude-code-acp.mjs
  acp-adapters/cli.js
  acp-adapters/codex/darwin-arm64/codex-acp
  acp-adapters/codex/darwin-x64/codex-acp
  acp-adapters/codex/linux-arm64/codex-acp
  acp-adapters/codex/linux-x64/codex-acp
)

live_bundles=(
  services/run-helpers-runtime.mjs
  services/generation-runtime.mjs
)

fail() {
  echo "::error::$1"
  exit 1
}

test -f "$ARCHIVE" || fail "archive not found: $ARCHIVE"
entries="$(unzip -Z1 "$ARCHIVE")"

# Byte count of an entry as stored, read without extracting to disk.
entry_size() {
  unzip -p "$ARCHIVE" "$1" | wc -c | tr -d '[:space:]'
}

for relative_path in "${legacy_placeholders[@]}"; do
  entry="${ARTIFACT}/${relative_path}"

  grep -Fxq "$entry" <<<"$entries" ||
    fail "missing legacy entry '$entry'; CLIs from 0.2.12 to 0.4.2 refuse an archive without it"

  size="$(entry_size "$entry")"
  [ "$size" -eq 0 ] ||
    fail "'$entry' is a legacy placeholder but carries $size bytes; it must be empty"
  echo "ok: $relative_path is an empty placeholder"
done

for relative_path in "${live_bundles[@]}"; do
  entry="${ARTIFACT}/${relative_path}"

  grep -Fxq "$entry" <<<"$entries" ||
    fail "missing companion bundle '$entry'; the CLI cannot run without it"

  size="$(entry_size "$entry")"
  [ "$size" -gt 0 ] ||
    fail "'$entry' is empty; the CLI cannot run without it"
  echo "ok: $relative_path carries $size bytes"
done

echo "Archive companion layout verified for $ARTIFACT."
