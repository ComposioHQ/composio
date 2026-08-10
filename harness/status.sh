#!/usr/bin/env bash
# Run telemetry: score history, wall-clock, LLM call counts, holdout usage.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUDIT_DIR="${COMPOSIO_GOAL_AUDIT_DIR:-$HOME/.composio-goal-audit}"
ARTIFACTS="$ROOT/.artifacts/examples-parity"
HISTORY="$ARTIFACTS/history.jsonl"
cd "$ROOT"

echo "== score history (last 15) =="
if [[ -f "$HISTORY" ]]; then
  tail -15 "$HISTORY" | jq -r '"  \(.ts)  \(.mode)  score=\(.score // "VOID")  ts=\(.cts // "-")/\(.dts // "-")+\(.pts // "-")  py=\(.cpy // "-")/\(.dpy // "-")+\(.ppy // "-")  \(.durationSec // 0)s"'
  first=$(head -1 "$HISTORY" | jq -r '.ts')
  echo
  echo "  first scored cycle: $first"
  echo "  cycles: $(wc -l < "$HISTORY" | tr -d ' ')"
else
  echo "  no scored cycles yet"
fi

echo
echo "== latest sweeps =="
for d in $(ls -td "$ARTIFACTS"/*-baseline "$ARTIFACTS"/*-candidate 2>/dev/null | head -4); do
  [[ -f "$d/summary.json" ]] || continue
  llm=$(cat "$d"/traces/*.jsonl 2>/dev/null | grep -c '"llm"' || true)
  backend=$(cat "$d"/traces/*.jsonl 2>/dev/null | grep -c '"m"' || true)
  jq -r --arg llm "$llm" --arg be "$backend" '"  \(.runId): \(.counts.green) green / \(.counts.red) red / \(.counts.skipped) skipped · backend calls \($be) · LLM calls \($llm)"' "$d/summary.json"
done

echo
echo "== holdout usage =="
if [[ -f "$AUDIT_DIR/holdout.log" ]]; then
  echo "  calls: $(wc -l < "$AUDIT_DIR/holdout.log" | tr -d ' ') (max 1 per 6h)"
else
  echo "  none yet"
fi

echo
echo "== budget reminders =="
echo "  full sweep target: <= 45 min · LLM per sweep: <= ~150 calls · see goal.md"
