#!/usr/bin/env bash
# Reads changelog paths from stdin and prints those that are not generated SDK release entries,
# which carry `sdkRelease:` in their frontmatter.
set -euo pipefail

while IFS= read -r path; do
  [ -n "$path" ] || continue
  if ! awk '
    NR == 1 { if ($0 !~ /^---\r?$/) exit 1; next }
    /^---\r?$/ { exit 1 }
    /^sdkRelease[[:space:]]*:[[:space:]]*[^[:space:]]/ { found = 1; exit 0 }
    END { exit !found }
  ' "$path"; then
    printf '%s\n' "$path"
  fi
done
