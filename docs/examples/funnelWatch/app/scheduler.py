"""Background scheduler: hourly digest, daily summary + rollover + archival."""
from __future__ import annotations

from datetime import date, timedelta

from apscheduler.schedulers.background import BackgroundScheduler

from app import durable, orchestrator, reports
from app.config import settings
from app.runtime import manager

_scheduler: BackgroundScheduler | None = None


def run_hourly() -> dict:
    vol = manager.volume
    result = orchestrator.run_cycle(vol, frequency="hourly", emit=True)
    reports.build_hourly_digest(vol)
    return {"fired": result["fired"], "insights": result["insights"]}


def run_daily() -> dict:
    """Finalize the day, start a fresh session, then archive aged-out data."""
    vol = manager.volume
    session_date = manager.session_date
    result = orchestrator.run_cycle(vol, frequency="daily", emit=True)
    _text, compact = reports.build_daily_summary(vol, session_date)
    durable.save_daily_summary(session_date, compact)
    roll = manager.rollover()
    archived = archive_aged_days()
    # Seed the fresh session's analytics so the dashboard isn't blank.
    orchestrator.run_cycle(manager.volume, frequency="real-time", emit=False)
    return {"fired": result["fired"], "summary": compact, "rollover": roll, **archived}


def archive_aged_days() -> dict:
    """Roll the retention window: summarize+prune days that have left the 7-day mount
    window, then drop durable summaries past the 6-month window.

    Returns ``{"archived": [dates], "pruned_summaries": [dates]}``.
    """
    mount_cutoff = (date.today() - timedelta(days=settings.mount_retention_days)).isoformat()
    archived: list[str] = []
    for day in manager.mount_days():
        if day >= mount_cutoff:
            continue  # still within the full-data window
        # Ensure the day survives as a durable summary before its mount data is dropped.
        if not durable.has_summary(day):
            day_vol = manager.volume_for(day)
            day_vol.sync_down("analytics")
            _text, compact = reports.build_daily_summary(day_vol, day)
            durable.save_daily_summary(day, compact)
        manager.prune_mount_day(day)
        archived.append(day)

    durable_cutoff = (date.today() - timedelta(days=settings.durable_retention_days)).isoformat()
    pruned_summaries = durable.prune_summaries(durable_cutoff)
    return {"archived": archived, "pruned_summaries": pruned_summaries}


def start() -> BackgroundScheduler:
    global _scheduler
    if _scheduler:
        return _scheduler
    s = BackgroundScheduler(daemon=True)
    s.add_job(run_hourly, "interval", hours=1, id="hourly", replace_existing=True)
    s.add_job(run_daily, "cron", hour=0, minute=0, id="daily", replace_existing=True)
    s.start()
    _scheduler = s
    return s
