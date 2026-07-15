"""Deterministic analytics: run ``app.jobs.analytics_job`` in-process over the volume's
local buffer and return the daily metrics dict (snapshots land in ``analytics/``).

This is fast, host-side infrastructure that powers the dashboard, monitors, and
baselines. It is intentionally NOT shipped to the workbench — the sandbox is reserved
for the *agent's* ad-hoc analysis and tool calls, where it's actually needed; running a
small deterministic job there only adds network latency to the hot ingest path.
"""
from __future__ import annotations

from pathlib import Path

from app import durable
from app.jobs import analytics_job

_BASELINE_DAYS = 7


def run(volume) -> dict:
    """Compute analytics over the volume's local buffer; return the daily metrics dict."""
    recent = durable.load_recent_summaries(_BASELINE_DAYS)
    return analytics_job.run(Path(volume.root), recent_summaries=recent)
