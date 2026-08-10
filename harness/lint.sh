#!/usr/bin/env bash
# Constraint lint. stdout: OK or VOID (details go to the audit dir, for the human).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUDIT_DIR="${COMPOSIO_GOAL_AUDIT_DIR:-$HOME/.composio-goal-audit}"
mkdir -p "$AUDIT_DIR"
cd "$ROOT"
exec node harness/lint-checks.mjs "$AUDIT_DIR"
