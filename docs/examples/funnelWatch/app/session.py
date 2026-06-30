"""Session lifecycle: one long-lived Composio session backs the app, with each calendar
day a subtree of the mount (``growth-pulse/{date}/``). Rollover advances the active day;
the mount keeps a rolling ``mount_retention_days`` window (older days are pruned). Falls
back to a plain local directory when Composio is unavailable.
"""
from __future__ import annotations

import shutil
from datetime import date
from pathlib import Path

from app import sandbox
from app.volume import LocalVolume, MountVolume


def _is_day(name: str) -> bool:
    """True for an ISO-date day subtree name (YYYY-MM-DD)."""
    return len(name) == 10 and name[4] == "-" and name[7] == "-" and name.replace("-", "").isdigit()


class SessionManager:
    def __init__(self, data_root: Path):
        self.data_root = Path(data_root)
        self.session_date = date.today().isoformat()
        self.volume = self._make_volume(self.session_date)

    def _cache_root(self, session_date: str) -> Path:
        return self.data_root / "growth-pulse" / session_date

    def _mount_prefix(self, session_date: str) -> str:
        return f"growth-pulse/{session_date}"

    def _make_volume(self, session_date: str):
        files = sandbox.files()
        if files is not None:
            return MountVolume(self._cache_root(session_date),
                               self._mount_prefix(session_date), files)
        return LocalVolume(self._cache_root(session_date))

    def volume_for(self, session_date: str):
        """A volume bound to any past day's workspace (for archiving aged-out days)."""
        return self._make_volume(session_date)

    def rollover(self) -> dict:
        """Advance the active day's workspace; the Composio session is unchanged."""
        old = self.session_date
        new = date.today().isoformat()
        self.session_date = new
        self.volume = self._make_volume(new)
        return {"old": old, "new": new}

    def needs_rollover(self) -> bool:
        return self.session_date != date.today().isoformat()

    def mount_days(self) -> list[str]:
        """ISO dates that still have a workspace (mount and/or local cache), newest first."""
        days: set[str] = set()
        files = sandbox.files()
        if files is not None:
            try:
                resp = files.list(path="growth-pulse", limit=500)
                for item in getattr(resp, "items", None) or []:
                    name = getattr(item, "name", None) or getattr(item, "mount_relative_path", "")
                    days.add(Path(name.rstrip("/")).name)
            except Exception:
                pass
        root = self.data_root / "growth-pulse"
        if root.exists():
            days.update(p.name for p in root.iterdir() if p.is_dir())
        return sorted((d for d in days if _is_day(d)), reverse=True)

    def prune_mount_day(self, session_date: str) -> bool:
        """Delete one day's workspace from the mount and the local cache."""
        removed = False
        files = sandbox.files()
        if files is not None:
            try:
                files.delete(self._mount_prefix(session_date))
                removed = True
            except Exception:
                pass
        cache = self._cache_root(session_date)
        if cache.exists():
            shutil.rmtree(cache, ignore_errors=True)
            removed = True
        return removed
