#!/usr/bin/env bash
#
# Resolve the CLI release target and write its metadata to $GITHUB_OUTPUT for the
# build/release jobs of build-cli-binaries.yml. Three modes:
#
#   - push to `next`                                      → rolling beta
#   - workflow_dispatch build-beta [version]              → rolling or explicitly versioned beta
#   - workflow_dispatch promote-stable <beta tag>         → stable promotion
#
# Inputs (env): EVENT_NAME, ACTION_INPUT, BETA_TAG_INPUT, VERSION_INPUT,
#               GITHUB_TOKEN, REPOSITORY, RUN_NUMBER, COMMIT_SHA
# Output: key=value lines appended to $GITHUB_OUTPUT
set -euo pipefail

# Latest STABLE @composio/cli release tag, by true semver order (empty if none).
#
# A lexical sort is wrong here: "@composio/cli@0.2.9" sorts AFTER "0.2.10", so once a
# patch reaches double digits `last` would pick the older release and beta versions
# would regress. Parse the version triplet to numbers and sort numerically instead.
latest_stable_tag() {
  gh release list \
    --repo "$REPOSITORY" \
    --exclude-drafts \
    --limit 1000 \
    --json tagName,isPrerelease \
    --jq '[.[]
            | select(.tagName | startswith("@composio/cli@"))
            | select(.isPrerelease == false)]
          | sort_by(.tagName | ltrimstr("@composio/cli@") | split(".") | map(tonumber))
          | last | .tagName // empty'
}

# Echo the next "<major>.<minor>.<patch+1>" off the latest stable release.
next_beta_base_version() {
  local latest current
  latest=$(latest_stable_tag)
  if [[ -z "$latest" ]]; then
    echo "No stable @composio/cli release found; provide VERSION_INPUT for the first beta" >&2
    return 1
  fi
  current=${latest#@composio/cli@}

  local major minor patch
  IFS='.' read -r major minor patch <<<"$current"
  echo "${major}.${minor}.$((patch + 1))"
}

version_is_greater() {
  local candidate=$1 baseline=$2
  local candidate_major candidate_minor candidate_patch
  local baseline_major baseline_minor baseline_patch
  IFS='.' read -r candidate_major candidate_minor candidate_patch <<<"$candidate"
  IFS='.' read -r baseline_major baseline_minor baseline_patch <<<"$baseline"

  ((candidate_major > baseline_major)) ||
    ((candidate_major == baseline_major && candidate_minor > baseline_minor)) ||
    ((
      candidate_major == baseline_major &&
        candidate_minor == baseline_minor &&
        candidate_patch > baseline_patch
    ))
}

emit_beta_target() {
  local requested_version=${1:-}
  local latest latest_version next_version release_tag
  if [[ -n "$requested_version" ]]; then
    if [[ ! "$requested_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "Beta version must match <major>.<minor>.<patch>" >&2
      return 1
    fi
    next_version=$requested_version
    latest=$(latest_stable_tag)
    if [[ -n "$latest" ]]; then
      latest_version=${latest#@composio/cli@}
      if ! version_is_greater "$next_version" "$latest_version"; then
        echo "Beta version ${next_version} must be newer than latest stable ${latest_version}" >&2
        return 1
      fi
    fi
  else
    next_version=$(next_beta_base_version)
  fi
  release_tag="@composio/cli@${next_version}-beta.${RUN_NUMBER}"
  {
    echo "checkout_ref=${COMMIT_SHA}"
    echo "release_name=CLI Beta ${release_tag}"
    echo "release_tag=${release_tag}"
    echo "release_version=${next_version}"
    echo "prerelease=true"
    echo "make_latest=false"
  } >>"$GITHUB_OUTPUT"
}

emit_stable_target() {
  local release_tag=$1 release_version=$2 checkout_ref=$3
  {
    echo "checkout_ref=${checkout_ref}"
    echo "release_name=CLI ${release_tag}"
    echo "release_tag=${release_tag}"
    echo "release_version=${release_version}"
    echo "prerelease=false"
    echo "make_latest=true"
  } >>"$GITHUB_OUTPUT"
}

# Every push to next is a beta. Stable releases always promote an already-tested
# beta, so package metadata can never create a second version authority.
if [[ "$EVENT_NAME" == "push" ]]; then
  emit_beta_target
  exit 0
fi

# ── workflow_dispatch: build-beta ──
if [[ "$EVENT_NAME" == "workflow_dispatch" && "$ACTION_INPUT" == "build-beta" ]]; then
  emit_beta_target "${VERSION_INPUT:-}"
  exit 0
fi

# ── workflow_dispatch: promote-stable ──
if [[ "$ACTION_INPUT" != "promote-stable" ]]; then
  echo "Unknown action: $ACTION_INPUT" >&2
  exit 1
fi

if [[ -z "$BETA_TAG_INPUT" ]]; then
  echo "beta_tag input is required for promote-stable" >&2
  exit 1
fi

encoded_beta_tag=$(python3 -c 'import os, urllib.parse; print(urllib.parse.quote(os.environ["BETA_TAG_INPUT"], safe=""))')

release_json=$(curl -fsSL \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPOSITORY}/releases/tags/${encoded_beta_tag}")

is_prerelease=$(jq -r '.prerelease' <<<"$release_json")
if [[ "$is_prerelease" != "true" ]]; then
  echo "Release ${BETA_TAG_INPUT} is not a beta prerelease" >&2
  exit 1
fi

if [[ ! "$BETA_TAG_INPUT" =~ ^@composio/cli@([0-9]+\.[0-9]+\.[0-9]+)-beta\.[0-9]+$ ]]; then
  echo "Beta tag must match @composio/cli@<version>-beta.<number>" >&2
  exit 1
fi

stable_version="${BASH_REMATCH[1]}"
stable_tag="@composio/cli@${stable_version}"

# Refuse to re-promote an already-PUBLISHED stable release, but allow resuming an
# existing DRAFT (a prior promote run that built assets but did not publish). The
# REST `/releases/tags/{tag}` endpoint returns 404 for drafts, so use `gh release view`
# — it resolves drafts by name and exposes `isDraft`.
if isdraft=$(gh release view "$stable_tag" --json isDraft --jq '.isDraft' 2>/dev/null); then
  if [[ "$isdraft" == "true" ]]; then
    echo "Stable release ${stable_tag} exists as a draft — resuming (assets will be re-uploaded)."
  else
    echo "Stable release ${stable_tag} is already published" >&2
    exit 1
  fi
fi

target_commitish=$(jq -r '.target_commitish' <<<"$release_json")
if [[ -z "$target_commitish" || "$target_commitish" == "null" ]]; then
  echo "Beta release ${BETA_TAG_INPUT} does not expose target_commitish" >&2
  exit 1
fi

emit_stable_target "$stable_tag" "$stable_version" "$target_commitish"
