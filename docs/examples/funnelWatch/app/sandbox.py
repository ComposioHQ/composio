"""The single long-lived Composio session: exposes the meta-tools the agent drives
(SEARCH_TOOLS / MULTI_EXECUTE / REMOTE_WORKBENCH / REMOTE_BASH) and a host-side files
handle for the storage mount at ``/mnt/files/``.

The agent writes and runs its own code in the workbench via the loop; the host never
ships code there. With no Composio key (or GROWTH_PULSE_FORCE_LOCAL=1) ``session()``
returns None and callers fall back to the local in-process path.
"""
from __future__ import annotations

import threading

from app.composio_client import READ_ONLY_TOOLKITS, get_composio
from app.config import settings

_lock = threading.Lock()
_session = None
_failed = False


def _toolkit_slugs() -> list[str]:
    # tool_router.create takes lowercase toolkit slugs (e.g. ['stripe', 'slack']).
    return [t.lower() for t in READ_ONLY_TOOLKITS]


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
    """Return the long-lived tool-rout  ss restarts; provisions a fresh session
    (with workbench + read-only toolkits) the first time.
    """
    global _session, _failed
    if _session is not None or _failed:
        return _session
    if not settings.use_sandbox:
        _failed = True
        return None
    with _lock:
        if _session is not None or _failed:
            return _session
        composio = get_composio()
        if composio is None:
            _failed = True
            return None
        workbench = {"enable": True, "sandbox_size": settings.composio_sandbox_size}
        try:
            sid = _load_session_id()
            if sid:
                try:
                    _session = composio.use(sid)
                except Exception:
                    _session = None  # stale/expired id — provision a new one
            if _session is None:
                _session = composio.create(
                    user_id=settings.user_id,
                    toolkits=_toolkit_slugs(),
                    workbench=workbench,
                )
                _save_session_id(_session.session_id)
            return _session
        except Exception:
            _failed = True
            _session = None
            return None


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
