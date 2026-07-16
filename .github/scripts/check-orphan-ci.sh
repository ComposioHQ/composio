#!/usr/bin/env bash
#
# Report orphaned CI plumbing — the GitHub Actions analogue of the "dead file"
# problem knip/vulture catch for TS/Python:
#
#   * composite actions under .github/actions/* that no workflow `uses:`
#   * reusable workflows (on: workflow_call) that nothing calls AND that have
#     no self-trigger (push/pull_request/schedule/...), i.e. truly unreachable
#
# Report-only: prints findings and always exits 0 so it never blocks CI on a
# heuristic. Vet anything it prints by hand before deleting.

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
workflows_dir="$repo_root/.github/workflows"
actions_dir="$repo_root/.github/actions"

findings=0

note() {
  findings=$((findings + 1))
  echo "  - $1"
}

echo "### Orphaned CI check"
echo ""
echo "Composite actions with no callers:"

if [[ -d "$actions_dir" ]]; then
  for action_yml in "$actions_dir"/*/action.yml "$actions_dir"/*/action.yaml; do
    [[ -f "$action_yml" ]] || continue
    name="$(basename "$(dirname "$action_yml")")"
    # A caller references it as `uses: ./.github/actions/<name>`.
    if ! grep -rqs "uses:.*\.github/actions/$name\b" "$workflows_dir" "$actions_dir"; then
      note "action \`$name\` (.github/actions/$name) is referenced by no workflow"
    fi
  done
fi
[[ $findings -eq 0 ]] && echo "  _(none)_"

before_wf=$findings
echo ""
echo "Reusable workflows that are unreachable:"

for wf in "$workflows_dir"/*.yml "$workflows_dir"/*.yaml; do
  [[ -f "$wf" ]] || continue
  # Only reusable workflows are candidates.
  grep -qs "workflow_call:" "$wf" || continue
  base="$(basename "$wf")"
  # Called by another workflow?
  if grep -rqs "uses:.*\.github/workflows/$base\b" "$workflows_dir"; then
    continue
  fi
  # Self-triggering (has a real event trigger besides workflow_call)?
  if grep -Eqs "^[[:space:]]+(push|pull_request|schedule|workflow_dispatch|release|issues|issue_comment|repository_dispatch|merge_group):" "$wf"; then
    continue
  fi
  note "workflow \`$base\` exposes workflow_call but has no caller and no self-trigger"
done
[[ $findings -eq $before_wf ]] && echo "  _(none)_"

echo ""
if [[ $findings -eq 0 ]]; then
  echo "No orphaned CI plumbing found."
else
  echo "Found $findings orphaned CI item(s) above — review before removing."
fi

# Report-only.
exit 0
