"""The single long-lived Composio session: exposes the meta-tools the agent drives
(SEARCH_TOOLS / MULTI_EXECUTE / REMOTE_WORKBENCH / REMOTE_BASH) and a host-side files
handle for the storage mount at ``/mnt/files/``.

The agent writes and runs its own code in the workbench via the loop; the host never
ships code there. The session is created with a per-toolkit **read-only tool
allowlist** (see app/composio_client.py), so the agent's reachable tool surface
contains no writes.

Resilience: failures retry with backoff (never latch), and when a stale session id
forces a fresh session, the re-provision is flagged so the volume can re-seed the
new (empty) mount from the local cache — otherwise the host and the agent would
silently see different data. ``health()`` reports status for self-monitoring.

With no Composio key (or GROWTH_PULSE_FORCE_LOCAL=1) ``session()`` returns None and
callers fall back to the local in-process path.
"""
from __future__ import annotations

import threading
import time

from app.composio_client import READ_ONLY_TOOLS, get_composio
from app.config import settings

_lock = threading.Lock()
_session = None
# Backoff instead of a latch: after a failure, retry no sooner than _retry_at.
_retry_at = 0.0
_backoff_s = 30.0
_BACKOFF_MAX_S = 600.0
_reprovisioned = False
_last_error: str | None = None


def _toolkit_slugs() -> list[str]:
    # tool_router.create takes lowercase toolkit slugs (e.g. ['stripe', 'slack']).
    return list(READ_ONLY_TOOLS)


def _load_session_id() -> str | None:
    p = settings.composio_session_file
    if p.exists():
        sid = p.read_text(encoding="utf-8").strip()
        return sid or None
    return None


def _save_session_id(session_id: str) -> None:
    p = settings.composio_session_file
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(session_id, encoding="utf-8")


def session():
    """Return the long-lived tool-router session, reused across restarts; provisions
    a fresh session (workbench + read-only tool allowlist) the first time.
    """
    global _session, _retry_at, _backoff_s, _reprovisioned, _last_error
    if _session is not None:
        return _session
    if not settings.use_sandbox or time.time() < _retry_at:
        return None
    with _lock:
        if _session is not None or time.time() < _retry_at:
            return _session
        composio = get_composio()
        if composio is None:
            _retry_at = time.time() + _backoff_s  # client unavailable — try again later
            return None
        workbench = {"enable": True, "sandbox_size": settings.composio_sandbox_size}
        try:
            sid = _load_session_id()
            if sid:
                try:
                    _session = composio.use(sid)
                except Exception:
                    _session = None  # stale/expired id — provision a fresh one below
            if _session is None:
                _session = composio.create(
                    user_id=settings.user_id,
                    toolkits=_toolkit_slugs(),
                    # Tool-level allowlist: only these reads exist inside the session,
                    # so no prompt can talk the agent into a write. See composio_client.
                    tools=READ_ONLY_TOOLS,
                    workbench=workbench,
                )
                _save_session_id(_session.session_id)
                if sid:
                    # The old session (and its mount) is gone. Flag it so the volume
                    # re-seeds the fresh, empty mount from the local cache.
                    _reprovisioned = True
            _backoff_s = 30.0
            _last_error = None
            return _session
        except Exception as exc:  # noqa: BLE001
            _last_error = f"{type(exc).__name__}: {exc}"
            _retry_at = time.time() + _backoff_s
            _backoff_s = min(_BACKOFF_MAX_S, _backoff_s * 2)
            _session = None
            return None


def consume_reprovisioned() -> bool:
    """True exactly once, right after a fresh session replaced a stale one."""
    global _reprovisioned
    if _reprovisioned:
        _reprovisioned = False
        return True
    return False


def health() -> dict:
    """Runtime status for self-monitoring (see orchestrator._record_runtime_health)."""
    if not settings.use_sandbox:
        return {"status": "local", "detail": "sandbox disabled (no key or forced local)"}
    if _session is not None:
        return {"status": "ok", "session_id": getattr(_session, "session_id", None)}
    return {"status": "degraded", "detail": _last_error or "not yet connected",
            "retry_at": _retry_at}


def available() -> bool:
    return session() is not None


def files():
    """The storage-mount handle (.upload/.list/.download/.delete), or None."""
    s = session()
    return s.experimental.files if s is not None else None


def tools():
    """Provider-wrapped meta-tools (SEARCH_TOOLS / MULTI_EXECUTE / REMOTE_WORKBENCH /
    REMOTE_BASH) for the agent loop, or None if there's no session."""
    s = session()
    return s.tools() if s is not None else None


def execute(slug: str, arguments: dict | None = None) -> dict:
    """Execute any session meta-tool/tool call (the agent's own COMPOSIO_REMOTE_WORKBENCH
    code included); returns {ok, data, stdout, error}."""
    s = session()
    if s is None:
        raise RuntimeError("Composio session unavailable")
    return _result(s.execute(slug, arguments=arguments or {}))


def _result(resp) -> dict:
    """Normalize a SessionExecuteResponse into {ok, data, stdout, error}."""
    data = getattr(resp, "data", None)
    error = getattr(resp, "error", None)
    stdout = ""
    if isinstance(data, dict):
        stdout = data.get("stdout") or data.get("output") or data.get("result") or ""
    return {"ok": not error, "data": data, "stdout": stdout, "error": error}
