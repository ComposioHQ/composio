#!/usr/bin/env bash
# Gaming gauge: negative controls + trace liveness + variance-allowlist usage.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACTS="$ROOT/.artifacts/examples-parity"
cd "$ROOT"

SAMPLE="${1:-8}"
SEED=$RANDOM
echo "== negative controls (sample $SAMPLE, seed $SEED) =="
node harness/run.mjs neg --sample "$SAMPLE" --seed "$SEED" || true

echo
echo "== trace liveness (latest baseline run) =="
BASE_RUN=$(ls -td "$ARTIFACTS"/*-baseline 2>/dev/null | head -1)
if [[ -z "${BASE_RUN:-}" ]]; then
  echo "no baseline run yet"
else
  node -e '
    const { readFileSync, existsSync } = require("fs");
    const path = require("path");
    const runDir = process.argv[1];
    const manifest = JSON.parse(readFileSync("examples-manifest.json", "utf8"));
    const backend = new Set(manifest.entries.filter(e => e.backend !== false).map(e => e.id));
    const rows = readFileSync(path.join(runDir, "results.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
    let dead = 0;
    for (const r of rows) {
      if (r.status !== "green" || !backend.has(r.id)) continue;
      const f = path.join(runDir, "traces", r.id.replace(/[/]/g, "__") + ".jsonl");
      const alive = existsSync(f) && readFileSync(f, "utf8").split("\n").some(l => l.includes("\"m\""));
      if (!alive) { console.log("  DEAD TRACE:", r.id); dead++; }
    }
    console.log(dead === 0 ? "  all green backend entries have live traces" : `  ${dead} dead trace(s) — a green run that never hit the backend is a cheat`);
  ' "$BASE_RUN"
fi

echo
echo "== parity variance allowlist =="
jq -r '.entries | if length == 0 then "  empty (cap 10)" else "  \(length)/10 used:", (.[] | "  - \(.pair): \(.justification)") end' parity-variance.json
