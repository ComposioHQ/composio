#!/usr/bin/env bash
# Scorer for the examples-live-parity goal.
#   harness/score.sh            → dev score (per-entry detail visible)
#   harness/score.sh --holdout  → full sweep + ALL negative controls; prints ONE number; rate-limited (6h)
#
# Score = 25·C_ts + 25·P_ts + 25·C_py + 25·P_py, where per language
#   C = baseline-green / frozen denominator, P = parity-green / frozen denominator.
# VOID on: lint violation · negative-control pass · trace-liveness failure.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUDIT_DIR="${COMPOSIO_GOAL_AUDIT_DIR:-$HOME/.composio-goal-audit}"
ARTIFACTS="$ROOT/.artifacts/examples-parity"
mkdir -p "$AUDIT_DIR" "$ARTIFACTS"
cd "$ROOT"

MODE=dev
[[ "${1:-}" == "--holdout" ]] && MODE=holdout
STARTED=$(date +%s)

void() {
  echo "VOID: constraint violation"
  echo "{\"ts\":\"$(date -u +%FT%TZ)\",\"mode\":\"$MODE\",\"result\":\"VOID\",\"why\":\"$1\"}" >> "$AUDIT_DIR/history.jsonl"
  exit 3
}

# Holdout rate limit: max one per 6 hours.
if [[ "$MODE" == "holdout" ]]; then
  last=$(tail -1 "$AUDIT_DIR/holdout.log" 2>/dev/null | cut -d' ' -f1 || true)
  now=$(date +%s)
  if [[ -n "${last:-}" ]] && (( now - last < 21600 )); then
    echo "holdout rate-limited: last call $(( (now - last) / 60 ))m ago (min 360m)"
    exit 2
  fi
  echo "$now" >> "$AUDIT_DIR/holdout.log"
fi

# 1. Lint gates everything.
lint_out=$(bash harness/lint.sh) || true
[[ "$lint_out" == "OK" ]] || void "lint"

# 2. Stage 0 gate: instruments must work before anything is scored.
if ! node harness/run.mjs selftest > "$AUDIT_DIR/selftest-last.log" 2>&1; then
  echo "SCORE 0.0 (stage0 red: selftest failing — run 'node harness/run.mjs selftest')"
  echo "{\"ts\":\"$(date -u +%FT%TZ)\",\"mode\":\"$MODE\",\"score\":0,\"why\":\"stage0\"}" >> "$ARTIFACTS/history.jsonl"
  exit 1
fi

# 3. Credentials gate.
if [[ -z "${COMPOSIO_API_KEY:-}" ]]; then
  echo "SCORE 0.0 (no credentials: COMPOSIO_API_KEY unset)"
  echo "{\"ts\":\"$(date -u +%FT%TZ)\",\"mode\":\"$MODE\",\"score\":0,\"why\":\"no-credentials\"}" >> "$ARTIFACTS/history.jsonl"
  exit 1
fi

# 4. Baseline sweep (both languages).
node harness/run.mjs sweep --client baseline || true
BASE_RUN=$(ls -td "$ARTIFACTS"/*-baseline 2>/dev/null | head -1)
[[ -n "$BASE_RUN" ]] || void "baseline sweep produced no run dir"

# 5. Negative controls: ALL backend entries, every scored cycle (garbage
# credentials cost nothing and fail fast). Any green = VOID.
node harness/run.mjs neg || void "negative-control pass (swallower)"

# 6. Trace liveness: every green backend entry must have recorded >=1 composio
# call (applied to every run dir we score, baseline and candidate).
liveness() {
  node -e '
    const { readFileSync, existsSync } = require("fs");
    const path = require("path");
    const runDir = process.argv[1];
    const baseline = JSON.parse(readFileSync("eval/baseline-tiers.json", "utf8"));
    const backend = new Set(Object.entries(baseline.backend).filter(([, b]) => b).map(([id]) => id));
    const rows = readFileSync(path.join(runDir, "results.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
    const dead = rows.filter(r => r.status === "green" && backend.has(r.id)).filter(r => {
      const f = path.join(runDir, "traces", r.id.replace(/[/]/g, "__") + ".jsonl");
      if (!existsSync(f)) return true;
      return !readFileSync(f, "utf8").split("\n").some(l => l.includes("\"m\""));
    });
    if (dead.length) { console.error("trace-dead:", dead.map(d => d.id).join(",")); process.exit(1); }
  ' "$1"
}
liveness "$BASE_RUN" || void "trace-liveness (baseline)"

# 7. Candidate sweeps + parity, per language, when artifacts are provided.
PARITY_TS=0; PARITY_PY=0
CAND_TS_RUN=""; CAND_PY_RUN=""
if [[ -n "${COMPOSIO_CLIENT_TARBALL:-}" ]]; then
  node harness/run.mjs sweep --client candidate --lang ts || true
  CAND_TS_RUN=$(ls -td "$ARTIFACTS"/*-candidate 2>/dev/null | head -1)
  if [[ -n "$CAND_TS_RUN" ]]; then
    liveness "$CAND_TS_RUN" || void "trace-liveness (ts candidate)"
    PARITY_TS=$(node harness/parity.mjs "$BASE_RUN" "$CAND_TS_RUN" 2>/dev/null | jq --slurpfile bt eval/baseline-tiers.json '[.entries[] | select(.id | startswith("ts/")) | select(.id | in($bt[0].tiers)) | select(.parity)] | length')
  fi
fi
if [[ -n "${COMPOSIO_CLIENT_WHEEL:-}" ]]; then
  node harness/run.mjs sweep --client candidate --lang py || true
  CAND_PY_RUN=$(ls -td "$ARTIFACTS"/*-candidate 2>/dev/null | head -1)
  if [[ -n "$CAND_PY_RUN" && "$CAND_PY_RUN" != "$CAND_TS_RUN" ]]; then
    liveness "$CAND_PY_RUN" || void "trace-liveness (py candidate)"
    PARITY_PY=$(node harness/parity.mjs "$BASE_RUN" "$CAND_PY_RUN" 2>/dev/null | jq --slurpfile bt eval/baseline-tiers.json '[.entries[] | select(.id | startswith("py/")) | select(.id | in($bt[0].tiers)) | select(.parity)] | length')
  fi
fi

# 8. Compute the score against FROZEN denominators; only ids present in the
# frozen baseline count toward the numerators (new entries earn no score).
read -r DTS DPY <<< "$(jq -r '"\(.denominators.ts) \(.denominators.py)"' eval/baseline-tiers.json)"
GTS=$(jq -s --slurpfile bt eval/baseline-tiers.json '[.[] | select(.status == "green") | select(.id | startswith("ts/")) | select(.id | in($bt[0].tiers))] | length' "$BASE_RUN/results.jsonl" 2>/dev/null | tail -1)
GPY=$(jq -s --slurpfile bt eval/baseline-tiers.json '[.[] | select(.status == "green") | select(.id | startswith("py/")) | select(.id | in($bt[0].tiers))] | length' "$BASE_RUN/results.jsonl" 2>/dev/null | tail -1)
SCORE=$(node -e "
  const [gts, gpy, pts, ppy, dts, dpy] = process.argv.slice(1).map(Number);
  const s = 25 * (gts / dts) + 25 * (pts / dts) + 25 * (gpy / dpy) + 25 * (ppy / dpy);
  console.log(s.toFixed(1));
" "$GTS" "$GPY" "$PARITY_TS" "$PARITY_PY" "$DTS" "$DPY")

ROW="{\"ts\":\"$(date -u +%FT%TZ)\",\"mode\":\"$MODE\",\"score\":$SCORE,\"cts\":$GTS,\"pts\":$PARITY_TS,\"cpy\":$GPY,\"ppy\":$PARITY_PY,\"dts\":$DTS,\"dpy\":$DPY,\"baseRun\":\"$(basename "$BASE_RUN")\",\"durationSec\":$(( $(date +%s) - STARTED ))}"
echo "$ROW" >> "$ARTIFACTS/history.jsonl"
echo "$ROW" >> "$AUDIT_DIR/history.jsonl"

if [[ "$MODE" == "holdout" ]]; then
  echo "HOLDOUT SCORE: $SCORE"
else
  echo "SCORE: $SCORE  (ts: $GTS/$DTS green, $PARITY_TS/$DTS parity · py: $GPY/$DPY green, $PARITY_PY/$DPY parity)"
fi
