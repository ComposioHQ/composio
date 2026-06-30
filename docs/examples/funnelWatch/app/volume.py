"""The session workspace: raw/normalized/analytics/report files laid out under
raw/, normalized/, analytics/, reports/.

Two backends share one interface so the rest of the app never knows which is live:

  * ``LocalVolume`` — a plain on-disk directory. The offline fallback used when no
    Composio key is configured (or GROWTH_PULSE_FORCE_LOCAL=1).

  * ``MountVolume`` — Composio's storage mount is the workspace of record. The local
    directory is demoted to a read cache + write buffer: writes land locally and are
    flushed to the mount in batches (``flush()``); the workbench sandbox reads/writes
    the same bytes at ``/mnt/files/``; analytics it produces are pulled back down
    (``sync_down()``). Heavy data never enters the agent's context — only small
    analytics JSON is read back.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

SUBDIRS = ("raw", "normalized", "analytics", "reports")
_lock = threading.Lock()


def _mimetype(rel: str) -> str:
    if rel.endswith((".json", ".jsonl")):
        return "application/json"
    if rel.endswith((".md", ".txt", ".csv")):
        return "text/plain"
    return "application/octet-stream"


class LocalVolume:
    """Filesystem-backed session workspace rooted at a local directory."""

    def __init__(self, root: Path):
        self.root = Path(root)
        for d in SUBDIRS:
            (self.root / d).mkdir(parents=True, exist_ok=True)

    def path(self, *parts: str) -> Path:
        return self.root.joinpath(*parts)

    # --- JSONL (append-only event/normalized streams) ---
    def append_jsonl(self, rel: str, obj: dict) -> None:
        p = self.path(rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(obj, default=str)
        with _lock:
            with p.open("a", encoding="utf-8") as f:
                f.write(line + "\n")
        self._touch(rel)

    def read_jsonl(self, rel: str, tail: int | None = None) -> list[dict]:
        self._ensure_local(rel)
        p = self.path(rel)
        if not p.exists():
            return []
        with p.open("r", encoding="utf-8") as f:
            rows = [json.loads(ln) for ln in f if ln.strip()]
        return rows[-tail:] if tail else rows

    # --- JSON (analytics snapshots) ---
    def write_json(self, rel: str, obj: Any) -> None:
        p = self.path(rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        with _lock:
            p.write_text(json.dumps(obj, indent=2, default=str), encoding="utf-8")
        self._touch(rel)

    def read_json(self, rel: str, default: Any = None) -> Any:
        self._ensure_local(rel)
        p = self.path(rel)
        if not p.exists():
            return default
        return json.loads(p.read_text(encoding="utf-8"))

    # --- Text (markdown reports / recommendations) ---
    def write_text(self, rel: str, text: str) -> None:
        p = self.path(rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        with _lock:
            p.write_text(text, encoding="utf-8")
        self._touch(rel)

    def read_text(self, rel: str, default: str = "") -> str:
        self._ensure_local(rel)
        p = self.path(rel)
        return p.read_text(encoding="utf-8") if p.exists() else default

    # --- mount hooks (no-ops for the local backend) ---
    def _touch(self, rel: str) -> None:  # mark dirty (mount backend overrides)
        pass

    def _ensure_local(self, rel: str) -> None:  # cold-cache fetch (mount overrides)
        pass

    def flush(self) -> None:  # push buffered writes to the mount
        pass

    def sync_down(self, prefix: str = "") -> int:  # pull mount files into the cache
        return 0


# Back-compat alias: existing imports of `Volume` keep working and get the local backend.
Volume = LocalVolume


class MountVolume(LocalVolume):
    """Composio storage mount is the source of truth; the local dir is a cache/buffer.

    ``cache_root`` is the local directory; ``mount_prefix`` is the day's subtree inside
    the single shared mount (e.g. ``growth-pulse/2026-06-23``); ``files`` is the mount
    handle from ``app.sandbox.files()``.
    """

    def __init__(self, cache_root: Path, mount_prefix: str, files):
        super().__init__(cache_root)
        self.mount_prefix = mount_prefix.strip("/")
        self._files = files
        self._dirty: set[str] = set()
        self._fetched: set[str] = set()

    def _remote(self, rel: str) -> str:
        return f"{self.mount_prefix}/{rel}"

    def _touch(self, rel: str) -> None:
        with _lock:
            self._dirty.add(rel)
            self._fetched.add(rel)  # local copy is now authoritative until flushed

    def _ensure_local(self, rel: str) -> None:
        """On a cold read (file not in cache yet), pull it down from the mount once."""
        if self._files is None or rel in self._fetched:
            return
        p = self.path(rel)
        if p.exists():
            self._fetched.add(rel)
            return
        try:
            remote = self._files.download(self._remote(rel))
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(remote.buffer())
        except Exception:
            pass  # not on the mount yet — treat as absent
        finally:
            self._fetched.add(rel)

    def flush(self) -> None:
        """Upload every buffered write to the mount so the sandbox sees current data."""
        if self._files is None:
            return
        with _lock:
            pending = sorted(self._dirty)
            self._dirty.clear()
        for rel in pending:
            p = self.path(rel)
            if not p.exists():
                continue
            try:
                self._files.upload(p.read_bytes(), remote_path=self._remote(rel),
                                   mimetype=_mimetype(rel))
            except Exception:
                with _lock:
                    self._dirty.add(rel)  # retry on the next flush

    def sync_down(self, prefix: str = "") -> int:
        """Download mount files under ``prefix`` (e.g. 'analytics') into the cache.

        Used after the sandbox writes analytics so the dashboard/agent read fresh data.
        """
        if self._files is None:
            return 0
        remote_prefix = self._remote(prefix).rstrip("/") if prefix else self.mount_prefix
        count, cursor = 0, None
        while True:
            try:
                resp = self._files.list(path=remote_prefix, cursor=cursor, limit=500)
            except Exception:
                break
            for item in getattr(resp, "items", None) or []:
                mrp = getattr(item, "mount_relative_path", None) or getattr(item, "path", None)
                if not mrp or mrp.endswith("/"):
                    continue
                rel = mrp[len(self.mount_prefix) + 1:] if mrp.startswith(self.mount_prefix + "/") else mrp
                try:
                    remote = self._files.download(mrp)
                    dest = self.path(rel)
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(remote.buffer())
                    self._fetched.add(rel)
                    count += 1
                except Exception:
                    continue
            cursor = getattr(resp, "next_cursor", None)
            if not cursor:
                break
        return count
