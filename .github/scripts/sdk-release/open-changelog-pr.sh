#!/usr/bin/env bash
set -euo pipefail

# Opens (or refreshes) the auto-merge PR that publishes the finalized changelog
# entry after a verified SDK release. Expects `sdk-release finalize` to have run
# and GH_TOKEN to hold a token that may push branches and open PRs.

if [ -z "$(git status --porcelain -- docs/content/changelog .github/sdk-release)" ]; then
  echo "No changelog changes to publish."
  exit 0
fi

branch="release/changelog-$(date -u +%Y-%m-%d)"
title="docs(changelog): publish SDK release notes"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git switch -c "$branch"
git add -A docs/content/changelog .github/sdk-release
git commit -m "$title"
git push -f origin "$branch"

if [ -z "$(gh pr list --head "$branch" --state open --json number --jq '.[].number')" ]; then
  gh pr create --base next --head "$branch" --title "$title" \
    --body "Automated follow-up to a verified SDK release: promotes the reviewed changelog draft into docs/content/changelog/."
fi
gh pr merge "$branch" --auto --squash
