#!/usr/bin/env bash

set -euo pipefail

current_commit=$(jq -r '.source.commit' kb/manifest.json)
echo "commit=$current_commit" >> "$GITHUB_OUTPUT"

if [ "$EVENT_NAME" = "repository_dispatch" ] && [ -z "$REQUESTED_SOURCE_COMMIT" ]; then
  echo "::error::Dispatched support knowledge refresh is missing source_commit."
  exit 1
fi

if [ "$HAVE_UPSTREAM" != "true" ]; then
  if [ "$EVENT_NAME" = "repository_dispatch" ]; then
    echo "::error::Cannot process a dispatched support knowledge refresh without an upstream token."
    exit 1
  fi
  echo "upstream_changed=false" >> "$GITHUB_OUTPUT"
  echo "No upstream token; skipping support-knowledge sync check and treating upstream as unchanged."
  exit 0
fi

checkout_commit=$(git -C "$SOURCE_ROOT" rev-parse HEAD)
if [ -n "$REQUESTED_SOURCE_COMMIT" ] && [ "$checkout_commit" != "$REQUESTED_SOURCE_COMMIT" ]; then
  echo "::error::Support knowledge HEAD $checkout_commit does not match dispatched commit $REQUESTED_SOURCE_COMMIT."
  exit 1
fi

if ! upstream_tip=$(git -C "$SOURCE_ROOT" rev-parse --verify refs/remotes/origin/main 2>/dev/null); then
  echo "::error::Cannot resolve the support knowledge main branch."
  exit 1
fi

if [ -n "$REQUESTED_SOURCE_COMMIT" ] && \
  ! git -C "$SOURCE_ROOT" merge-base --is-ancestor "$REQUESTED_SOURCE_COMMIT" "$upstream_tip"; then
  echo "::error::Dispatched support knowledge commit $REQUESTED_SOURCE_COMMIT is not on upstream main."
  exit 1
fi

if [ "$upstream_tip" = "$current_commit" ]; then
  echo "upstream_changed=false" >> "$GITHUB_OUTPUT"
  echo "Support knowledge is already current at $upstream_tip."
elif ! git -C "$SOURCE_ROOT" cat-file -e "$current_commit^{commit}" 2>/dev/null; then
  echo "::error::Published support knowledge commit $current_commit is unavailable in the upstream history."
  exit 1
elif ! git -C "$SOURCE_ROOT" merge-base --is-ancestor "$current_commit" "$upstream_tip"; then
  echo "::error::Published support knowledge commit $current_commit is not on upstream main."
  exit 1
elif ! source_commit=$(git -C "$SOURCE_ROOT" log --first-parent -1 --format=%H \
  "$current_commit..$upstream_tip" -- ':(glob)**/public.md'); then
  echo "::error::Cannot inspect public support knowledge history."
  exit 1
elif [ -z "$source_commit" ]; then
  echo "upstream_changed=false" >> "$GITHUB_OUTPUT"
  echo "No public support knowledge changed between $current_commit and $upstream_tip."
else
  git -C "$SOURCE_ROOT" checkout --detach "$source_commit"
  echo "commit=$source_commit" >> "$GITHUB_OUTPUT"
  echo "upstream_changed=true" >> "$GITHUB_OUTPUT"
  echo "Refreshing support knowledge from $current_commit to $source_commit."
fi
