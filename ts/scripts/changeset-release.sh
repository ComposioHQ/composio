#!/usr/bin/env bash
set -euo pipefail

# changesets/action infers which GitHub tags/releases to push from `New tag:`
# lines printed by `changeset publish`. The CLI binary workflow owns
# @composio/cli GitHub Releases because those releases must include platform
# binary assets. Let changesets publish/tag every other package, but hide the
# private CLI tag from changesets/action so ts.release.yml cannot create an
# empty @composio/cli GitHub Release.

stdout_file=$(mktemp)
stderr_file=$(mktemp)
trap 'rm -f "$stdout_file" "$stderr_file"' EXIT

pnpm run build:packages

set +e
pnpm changeset publish >"$stdout_file" 2>"$stderr_file"
status=$?
set -e

sed '/New tag:[[:space:]]*@composio\/cli@/d' "$stdout_file"
cat "$stderr_file" >&2

exit "$status"
