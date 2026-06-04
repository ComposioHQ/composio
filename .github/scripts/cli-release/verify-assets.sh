#!/usr/bin/env bash
#
# Loud failure gate: assert the full canonical asset set is attached to the release AND fully
# uploaded (state == "uploaded"). An asset can appear in the listing while still processing,
# which is exactly how a release ends up serving 404s — so require state == "uploaded", with a
# bounded retry while uploads settle.
#
# Inputs (env): RELEASE_TAG, GH_TOKEN
#               VERIFY_ATTEMPTS / VERIFY_SLEEP_SECONDS (optional, for fast tests)
set -euo pipefail

# Keep this list in lock-step with the build matrix in build-cli-binaries.yml (4 platforms)
# plus the skill bundle and checksums. Adding a platform to the matrix must extend this list.
expected=(
  composio-linux-x64.zip
  composio-linux-aarch64.zip
  composio-darwin-x64.zip
  composio-darwin-aarch64.zip
  composio-skill.zip
  checksums.txt
)

attempts="${VERIFY_ATTEMPTS:-10}"
sleep_seconds="${VERIFY_SLEEP_SECONDS:-15}"

for attempt in $(seq 1 "$attempts"); do
  # Single snapshot per attempt — querying names and state separately would open a
  # time-of-check/time-of-use gap in the very gate meant to close one.
  payload=$(gh release view "$RELEASE_TAG" --json assets)
  mapfile -t uploaded < <(jq -r '.assets[] | select(.state == "uploaded") | .name' <<<"$payload" | sort)

  missing=()
  for want in "${expected[@]}"; do
    printf '%s\n' "${uploaded[@]}" | grep -qxF "$want" || missing+=("$want")
  done

  if [[ ${#missing[@]} -eq 0 ]]; then
    echo "✅ All ${#expected[@]} expected assets present and uploaded."
    exit 0
  fi

  echo "Attempt ${attempt}/${attempts} — missing or not-yet-uploaded: ${missing[*]}"
  if [[ "$attempt" -eq "$attempts" ]]; then
    echo "::error::Release $RELEASE_TAG is incomplete — missing or not uploaded: ${missing[*]}"
    exit 1
  fi
  sleep "$sleep_seconds"
done
