"""Host-mediated persistence for agent-produced results.

The LLM runs read-only in the sandbox; it cannot reach durable storage or the host
filesystem directly (different machine, and the read-only guard blocks writes). When the
agent wants something persisted it returns a structured *save request* (see
``app.agent``); the host validates it and commits it here.

Two targets, one call:
  * **durable** — a keyed row in the SQLite artifacts table (survives restarts/rollover).
  * **local**   — a JSON file under ``data/exports/`` on the host filesystem, OUTSIDE the
                  day-cache subtree. The filename is sanitised so a request can never
                  escape the export dir (no traversal, no absolute paths).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from app import durable
from app.config import settings

# Host filesystem location for local exports — deliberately separate from the volume
# cache (data/growth-pulse/...) so agent artifacts never collide with mount data.
EXPORT_DIR = settings.data_root / "exports"

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_filename(name: str) -> str:
    """Reduce an arbitrary name to a single safe filename (no path components)."""
    base = Path(name or "artifact.json").name          # strip any directory parts
    base = _SAFE.sub("-", base).strip("-.") or "artifact"
    if not base.endswith(".json"):
        base += ".json"
    return base


def save(key: str, value, *, durable_store: bool = True, local: bool = False,
         filename: str | None = None) -> dict:
    """Persist ``value`` under ``key`` to the requested target(s).

    Returns a manifest of what was written, e.g.
    ``{"durable": "campaign_roas", "local": "/abs/path/exports/campaign_roas.json"}``.
    """
    if not key or not isinstance(key, str):
        raise ValueError("save() requires a non-empty string key")
    saved: dict = {}
    if durable_store:
        durable.save_artifact(key, value)
        saved["durable"] = key
    if local:
        name = _safe_filename(filename or f"{key}.json")
        path = EXPORT_DIR / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, indent=2, default=str), encoding="utf-8")
        saved["local"] = str(path)
    return saved


def apply_request(request) -> list[dict]:
    """Commit one or more save requests emitted by the agent.

    A request is a dict (or list of dicts):
        {"key": str, "value": <any>, "durable": bool=True, "local": bool=False,
         "filename": str|None}
    Unknown/invalid requests are skipped. Returns the list of write manifests.
    """
    requests = request if isinstance(request, list) else [request]
    manifests: list[dict] = []
    for req in requests:
        if not isinstance(req, dict) or "key" not in req:
            continue
        try:
            manifests.append(save(
                req["key"], req.get("value"),
                durable_store=req.get("durable", True),
                local=req.get("local", False),
                filename=req.get("filename"),
            ))
        except Exception as exc:
            manifests.append({"error": str(exc), "key": req.get("key")})
    return manifests
