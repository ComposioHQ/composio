#!/usr/bin/env bash

# Check the validity of all actions used in the workflows.
#
# Example output:
#
# ❯ .github/scripts/check-action-repos.sh                                  
# Found 18 unique uses: entries
# WARN: unrecognized uses format: ---
# ERROR: ref not found (tag/branch/commit): peter-evans/create-pull-request@271a8d0340265f705b14b601f8cf3c8c27d2d6cf
# ERROR: ref not found (tag/branch/commit): slackapi/slack-github-action@b4590ed38561d3cb7512cbee19cef0e0a6064ff1

set -euo pipefail

fail=0

# Collect all `uses:` entries
mapfile -t USES < <(
  yq -r '
    .jobs[]?.steps[]? |
    select(has("uses")) |
    .uses
  ' .github/workflows/*.yml .github/workflows/*.yaml 2>/dev/null \
  | sed '/^null$/d' \
  | sort -u
)

if [[ ${#USES[@]} -eq 0 ]]; then
  echo "No uses: entries found."
  exit 0
fi

echo "Found ${#USES[@]} unique uses: entries"

check_local() {
  local p="$1"
  if [[ ! -e "$p" ]]; then
    echo "ERROR: local action path does not exist: $p"
    return 1
  fi
  if [[ -d "$p" ]]; then
    if [[ -f "$p/action.yml" || -f "$p/action.yaml" ]]; then
      return 0
    fi
    echo "ERROR: local action dir missing action.yml/action.yaml: $p"
    return 1
  fi
  # If a file is used directly (rare), just ensure it exists
  return 0
}

# For remote actions, verify:
# - repo exists
# - ref exists (tag/branch/sha)
# - action.yml or action.yaml exists at path (or root) at that ref
check_remote() {
  local spec="$1"                    # owner/repo/path@ref OR owner/repo@ref
  local before_at="${spec%@*}"
  local ref="${spec#*@}"

  local owner_repo="${before_at%%/*}/${before_at#*/}"
  owner_repo="${owner_repo%%/*}/${owner_repo#*/}" # keep first two segments

  local owner="${before_at%%/*}"
  local rest="${before_at#*/}"
  local repo="${rest%%/*}"

  local path=""
  if [[ "$before_at" == */*/* ]]; then
    path="${before_at#"$owner/$repo/"}"
  fi

  # 1) repo exists
  if ! gh api -H "Accept: application/vnd.github+json" "/repos/$owner/$repo" >/dev/null 2>&1; then
    echo "ERROR: repo not found or inaccessible: $owner/$repo (from $spec)"
    return 1
  fi

  # 2) ref exists (try tag, branch, then commit)
  if ! gh api -H "Accept: application/vnd.github+json" "/repos/$owner/$repo/git/ref/tags/$ref" >/dev/null 2>&1 \
     && ! gh api -H "Accept: application/vnd.github+json" "/repos/$owner/$repo/git/ref/heads/$ref" >/dev/null 2>&1 \
     && ! gh api -H "Accept: application/vnd.github+json" "/repos/$owner/$repo/commits/$ref" >/dev/null 2>&1
  then
    echo "ERROR: ref not found (tag/branch/commit): $spec"
    return 1
  fi

  # 3) action metadata exists at path (or root)
  local base_path="${path}"
  if [[ -z "$base_path" ]]; then
    base_path=""
  fi

  local try_paths=()
  if [[ -z "$base_path" ]]; then
    try_paths=("action.yml" "action.yaml")
  else
    try_paths=("$base_path/action.yml" "$base_path/action.yaml")
  fi

  for p in "${try_paths[@]}"; do
    if gh api -H "Accept: application/vnd.github+json" \
      "/repos/$owner/$repo/contents/$p?ref=$ref" >/dev/null 2>&1
    then
      return 0
    fi
  done

  echo "ERROR: action metadata not found at ref: $spec (looked for action.yml/action.yaml under '${base_path:-repo root}')"
  return 1
}

for u in "${USES[@]}"; do
  # Ignore reusable workflows here: they also use `uses:` but are `./.github/workflows/x.yml` or `owner/repo/.github/workflows/x.yml@ref`
  # If you want to validate those too, add logic similar to check_local/check_remote for workflow files.
  if [[ "$u" == docker://* ]]; then
    echo "SKIP (docker image): $u"
    continue
  fi

  if [[ "$u" == ./* ]]; then
    if ! check_local "$u"; then fail=1; fi
    continue
  fi

  # Remote action or reusable workflow reference (both look like owner/repo/...@ref)
  if [[ "$u" == *@* && "$u" == */* ]]; then
    if ! check_remote "$u"; then fail=1; fi
    continue
  fi

  echo "WARN: unrecognized uses format: $u"
done

exit $fail
