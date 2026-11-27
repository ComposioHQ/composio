#!/usr/bin/env bash
#
# Publish the latest stable CLI release tag to the orphan `cli-release-metadata`
# branch so installers can resolve it via raw.githubusercontent.com without
# touching the unauthenticated GitHub REST API.
#
# Inputs (env):
#   RELEASE_TAG          Required stable tag matching @composio/cli@X.Y.Z
#   REPOSITORY           Optional owner/repo (default: ${GITHUB_REPOSITORY:-ComposioHQ/composio})
#   METADATA_BRANCH      Optional branch name (default: cli-release-metadata)
#   GH_TOKEN / GITHUB_TOKEN  Token with contents:write when pushing to GitHub
#   METADATA_REMOTE_URL  Optional git remote override for local/hermetic tests
set -euo pipefail

RELEASE_TAG=${RELEASE_TAG:-}
REPOSITORY=${REPOSITORY:-${GITHUB_REPOSITORY:-ComposioHQ/composio}}
METADATA_BRANCH=${METADATA_BRANCH:-cli-release-metadata}

if [[ ! "$RELEASE_TAG" =~ ^@composio/cli@[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Refusing to publish non-stable CLI release tag to ${METADATA_BRANCH}: ${RELEASE_TAG:-<empty>}" >&2
  exit 1
fi

if [[ ! "$REPOSITORY" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]]; then
  echo "Invalid REPOSITORY: ${REPOSITORY}" >&2
  exit 1
fi

git_auth_args=()
if [[ -n "${METADATA_REMOTE_URL:-}" ]]; then
  remote_url=$METADATA_REMOTE_URL
else
  token=${GH_TOKEN:-${GITHUB_TOKEN:-}}
  if [[ -z "$token" ]]; then
    echo "GH_TOKEN or GITHUB_TOKEN is required to push ${METADATA_BRANCH}" >&2
    exit 1
  fi
  remote_url="https://github.com/${REPOSITORY}.git"
  basic_auth=$(printf 'x-access-token:%s' "$token" | base64 | tr -d '\n')
  git_auth_args=(-c "http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic_auth}")
fi

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

git init -q "$work_dir/repo"
git -C "$work_dir/repo" config user.name 'github-actions[bot]'
git -C "$work_dir/repo" config user.email '41898282+github-actions[bot]@users.noreply.github.com'

# Distinguish "branch does not exist yet" (exit 2 from ls-remote --exit-code)
# from real auth/network failures so we never silently overwrite an existing branch.
ls_remote_status=0
git ${git_auth_args[@]+"${git_auth_args[@]}"} -C "$work_dir/repo" \
  ls-remote --exit-code --heads "$remote_url" "$METADATA_BRANCH" >/dev/null || ls_remote_status=$?

if [[ "$ls_remote_status" -eq 0 ]]; then
  git ${git_auth_args[@]+"${git_auth_args[@]}"} -C "$work_dir/repo" \
    fetch -q --depth=1 "$remote_url" "refs/heads/${METADATA_BRANCH}:refs/heads/${METADATA_BRANCH}"
  git -C "$work_dir/repo" checkout -q "$METADATA_BRANCH"
elif [[ "$ls_remote_status" -eq 2 ]]; then
  git -C "$work_dir/repo" checkout -q --orphan "$METADATA_BRANCH"
else
  echo "Failed to inspect remote branch ${METADATA_BRANCH} (git ls-remote exit ${ls_remote_status})" >&2
  exit "$ls_remote_status"
fi

printf '%s\n' "$RELEASE_TAG" >"$work_dir/repo/latest.txt"

if git -C "$work_dir/repo" ls-files --error-unmatch latest.txt >/dev/null 2>&1 &&
  git -C "$work_dir/repo" diff --quiet -- latest.txt; then
  echo "${METADATA_BRANCH}/latest.txt already points to ${RELEASE_TAG}"
  exit 0
fi

git -C "$work_dir/repo" add latest.txt
git -C "$work_dir/repo" commit -q -m "chore(cli-release): point latest to ${RELEASE_TAG}"
git ${git_auth_args[@]+"${git_auth_args[@]}"} -C "$work_dir/repo" push -q "$remote_url" "HEAD:refs/heads/${METADATA_BRANCH}"
echo "Updated ${METADATA_BRANCH}/latest.txt to ${RELEASE_TAG}"
