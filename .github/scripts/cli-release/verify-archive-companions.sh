#!/usr/bin/env bash
#
# Loud failure gate: assert one release archive carries the companion layout the CLI
# actually ships — the legacy paths present but empty, the live bundles present with
# real bytes, and a release-manifest.json that lists exactly what upgrades must install.
#
# Each check guards a different failure:
#
#   - A missing legacy path breaks `composio upgrade` for every stable CLI from 0.2.12
#     to 0.4.2. Those clients verify a downloaded package against their own path list,
#     by existence only, and refuse one that lacks any of them.
#   - A legacy path with content means sub-agent or adapter code is shipping again. The
#     helper it served was removed; the path is only a placeholder.
#   - The companion paths (services/*.mjs and their root wrappers) hold stubs: the
#     executable carries the code. They stay non-empty and listed in the manifest
#     because released manifest-aware clients refuse a manifest with no companions and
#     install what it lists.
#   - Manifest-aware clients install what release-manifest.json lists and nothing else,
#     and refuse a manifest they cannot decode. A manifest that omits a live bundle
#     ships an install that cannot run; one that lists a placeholder or a missing entry
#     fails every upgrade to this release.
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
    fail "missing companion '$entry'; released clients refuse an upgrade archive without it"

  size="$(entry_size "$entry")"
  [ "$size" -gt 0 ] ||
    fail "'$entry' is empty; it must hold the companion stub"
  echo "ok: $relative_path carries $size bytes"
done

manifest_entry="${ARTIFACT}/release-manifest.json"
grep -Fxq "$manifest_entry" <<<"$entries" ||
  fail "missing '$manifest_entry'; manifest-aware clients check upgrades against it"
manifest="$(unzip -p "$ARCHIVE" "$manifest_entry")"

jq -e '.schemaVersion == 1' <<<"$manifest" >/dev/null ||
  fail "'$manifest_entry' must have schemaVersion 1"
jq -e '.minimumUpgradeFrom | type == "string" and test("^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$")' \
  <<<"$manifest" >/dev/null ||
  fail "'$manifest_entry' must have a semver minimumUpgradeFrom"
jq -e '.companions | type == "array" and length > 0 and all(type == "string")' \
  <<<"$manifest" >/dev/null ||
  fail "'$manifest_entry' must list its companions"
jq -e '.companions == (.companions | unique)' <<<"$manifest" >/dev/null ||
  fail "'$manifest_entry' must list its companions sorted and without duplicates; the CLI refuses any other order"
# jq on Windows writes CRLF line endings in text mode.
manifest_companions="$(jq -r '.companions[]' <<<"$manifest" | tr -d '\r')"

for relative_path in "${live_bundles[@]}"; do
  grep -Fxq "$relative_path" <<<"$manifest_companions" ||
    fail "'$manifest_entry' does not list '$relative_path'; upgrades would not install it"
done

for relative_path in "${legacy_placeholders[@]}"; do
  if grep -Fxq "$relative_path" <<<"$manifest_companions"; then
    fail "'$manifest_entry' lists the legacy placeholder '$relative_path'; it must list live companions only"
  fi
done

listed=0
while IFS= read -r relative_path; do
  entry="${ARTIFACT}/${relative_path}"
  grep -Fxq "$entry" <<<"$entries" ||
    fail "'$manifest_entry' lists '$relative_path', which the archive does not contain"
  size="$(entry_size "$entry")"
  [ "$size" -gt 0 ] ||
    fail "'$manifest_entry' lists '$relative_path', which is empty"
  listed=$((listed + 1))
done <<<"$manifest_companions"
echo "ok: release-manifest.json lists $listed live companions"

echo "Archive companion layout verified for $ARTIFACT."
