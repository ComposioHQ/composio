#!/usr/bin/env bash
#
# dev.sh — boot the full FunnelWatch demo stack in one shot:
#   1. FastAPI server (app.main:app)
#   2. cloudflared quick tunnel exposing the webhook endpoint publicly
#   3. mock SaaS event simulator (tools/simulate.py)
#
# It prints the public Cloudflare URL + the exact webhook path to paste into
# Composio's project webhook / Slack trigger settings, then keeps the server
# and tunnel running until you hit Ctrl-C.
#
# Usage:
#   ./dev.sh                 # default: lead-quality scenario
#   ./dev.sh --spike         # breach the 5% failed-payment monitor
#   ./dev.sh --seed-history  # (any simulate.py flags are forwarded)
#   PORT=9000 ./dev.sh       # override the local port
#
set -euo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-8000}"
SIM_ARGS=("$@")
CF_LOG="$(mktemp -t funnelwatch-cf.XXXXXX)"
PIDS=()

cleanup() {
  echo
  echo "Shutting down…"
  for pid in ${PIDS[@]+"${PIDS[@]}"}; do
    kill "$pid" 2>/dev/null || true
  done
  rm -f "$CF_LOG"
}
trap cleanup EXIT INT TERM

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "✗ '$1' not found — $2"; exit 1; }
}
require uv "install from https://docs.astral.sh/uv/"
require cloudflared "install with: brew install cloudflared"

# --- 1. FastAPI server ---------------------------------------------------------
echo "▸ Starting FastAPI server on http://localhost:${PORT} …"
uv run uvicorn app.main:app --host 0.0.0.0 --port "${PORT}" --no-access-log &
PIDS+=($!)

echo "  waiting for server to come up…"
for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:${PORT}/" >/dev/null 2>&1; then
    echo "  ✓ server is up"
    break
  fi
  sleep 0.5
done

# --- 2. cloudflared quick tunnel ----------------------------------------------
echo "▸ Starting cloudflared tunnel → localhost:${PORT} …"
cloudflared tunnel --url "http://localhost:${PORT}" --no-autoupdate >"$CF_LOG" 2>&1 &
PIDS+=($!)

echo "  waiting for public URL…"
PUBLIC_URL=""
for _ in $(seq 1 60); do
  PUBLIC_URL="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$CF_LOG" | head -n1 || true)"
  [ -n "$PUBLIC_URL" ] && break
  sleep 0.5
done

if [ -z "$PUBLIC_URL" ]; then
  echo "✗ could not obtain a Cloudflare URL. tunnel log:"
  cat "$CF_LOG"
  exit 1
fi

WEBHOOK_URL="${PUBLIC_URL}/webhooks/composio"

# --- 3. mock data --------------------------------------------------------------
echo "▸ Seeding mock data via tools/simulate.py …"
uv run python tools/simulate.py --url "http://localhost:${PORT}/webhooks/composio" ${SIM_ARGS[@]+"${SIM_ARGS[@]}"} || true

# --- summary -------------------------------------------------------------------
cat <<EOF

────────────────────────────────────────────────────────────────────
  ✅ FunnelWatch is live

  Dashboard      : http://localhost:${PORT}
  Cloudflare URL : ${PUBLIC_URL}

  👉 Paste this into Composio's webhook / Slack trigger settings:
       ${WEBHOOK_URL}

  Server + tunnel are running. Press Ctrl-C to stop.
────────────────────────────────────────────────────────────────────
EOF

# Keep the foreground alive so the trap fires on Ctrl-C.
wait
