"""Always-on session orchestration.

This is the "agent session" loop for the app: keep the current 24-hour volume
fresh, evaluate monitors, produce structured insights, and optionally emit
important updates. It is called after webhooks, by scheduled jobs, and by manual
refreshes.
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone

from app import analytics, insights, monitors
from app.runtime import manager
from app.volume import Volume

# Background, coalescing runner for the real-time cycle: a burst of webhooks triggers a
# single sequential worker (never stacks), keeping the ingest request path instant.
_cycle_lock = threading.Lock()
_cycle_pending = threading.Event()

_last_status: str | None = None  # runtime status last recorded (for transition alerts)


def _record_runtime_health(volume: Volume) -> None:
    """Self-monitoring: a monitor that silently loses its own backend is worse than
    no monitor. Snapshot the session status each cycle; alert on transitions."""
    global _last_status
    from app import sandbox, slack

    health = sandbox.health()
    status = health.get("status")
    volume.write_json("analytics/runtime_health.json",
                      {**health, "checked_at": datetime.now(timezone.utc).isoformat()})
    if status == _last_status:
        return
    if status == "degraded":
        slack.send_internal_update(
            volume, "FunnelWatch runtime degraded",
            f"The Composio session is unavailable ({health.get('detail', 'unknown')}). "
            "Ingest continues on the local buffer, but mount flushes and agent answers "
            "are paused until it reconnects (automatic retry with backoff).",
            kind="alert", meta={"severity": "high", "source": "runtime"})
    elif status == "ok" and _last_status == "degraded":
        slack.send_internal_update(
            volume, "FunnelWatch runtime recovered",
            "The Composio session reconnected. Mount flushes and agent answers resumed.",
            kind="alert", meta={"severity": "info", "source": "runtime"})
    _last_status = status


def run_cycle(volume: Volume | None = None, *, frequency: str = "real-time",
              emit: bool = False) -> dict:
    vol = volume or manager.volume
    metrics = analytics.run(vol)
    fired = monitors.evaluate(vol, frequency=frequency)
    ranked = insights.evaluate(vol, emit=emit)
    _record_runtime_health(vol)
    # Periodic flush: push buffered events + monitor/insight outputs to the mount.
    # No-op for the local fallback backend.
    vol.flush()
    return {
        "status": "ok",
        "frequency": frequency,
        "metrics": metrics,
        "fired": fired,
        "insights": ranked,
    }


def trigger_cycle() -> None:
    """Request a real-time cycle to run in the background. Rapid calls (a burst of
    webhooks) coalesce into one sequential worker, so ingest never blocks or stacks."""
    _cycle_pending.set()
    _ensure_worker()


def _ensure_worker() -> None:
    if _cycle_lock.acquire(blocking=False):
        threading.Thread(target=_drain_cycles, daemon=True).start()


def _drain_cycles() -> None:
    try:
        while _cycle_pending.is_set():
            _cycle_pending.clear()
            try:
                run_cycle(manager.volume, frequency="real-time", emit=True)
            except Exception:
                pass
    finally:
        _cycle_lock.release()
    # A trigger may have landed after the last check but before release — re-ensure.
    if _cycle_pending.is_set():
        _ensure_worker()
