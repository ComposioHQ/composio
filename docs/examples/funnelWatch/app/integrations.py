"""Connected-account state for the Settings modal.

Connection status reflects reality, not a hardcoded default: a toolkit is "connected"
only if it has a real Composio connected account, OR the user connected it here. Nothing
is connected until the user actually links it — so the panel never claims, e.g., that
Slack is connected when no one ever authorized it.

The Connect/Disconnect buttons are the local demo stand-in for the Composio OAuth flow;
the saved override is layered on top of whatever Composio actually reports.
"""
from __future__ import annotations

import json

from app.config import settings

_FILE = settings.data_root / "overrides.json"  # user Connect/Disconnect choices only

CATALOG = [
    {"key": "stripe", "name": "Stripe", "purpose": "Subscriptions, MRR, churn, failed payments"},
    {"key": "posthog", "name": "PostHog", "purpose": "Web & product analytics (visits, signups, activation)"},
    {"key": "hubspot", "name": "HubSpot", "purpose": "Leads, deals, pipeline"},
    {"key": "googleads", "name": "Google Ads", "purpose": "Acquisition spend & clicks"},
    {"key": "slack", "name": "Slack", "purpose": "Internal alerts"},
    {"key": "sheets", "name": "Google Sheets", "purpose": "Durable reports"},
]


def _overrides() -> dict:
    if _FILE.exists():
        try:
            return json.loads(_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save_overrides(data: dict) -> None:
    _FILE.parent.mkdir(parents=True, exist_ok=True)
    _FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _composio_connected() -> set[str]:
    """Toolkit keys that have a real Composio connected account (empty if not authed)."""
    from app.composio_client import get_composio

    composio = get_composio()
    if composio is None:
        return set()
    try:
        accounts = composio.connected_accounts.list()
        items = getattr(accounts, "items", None) or accounts or []
        out = set()
        for a in items:
            tk = getattr(a, "toolkit", None) or getattr(a, "app_name", None) or ""
            out.add(str(tk).lower())
        return out
    except Exception:
        return set()


def load() -> list[dict]:
    real = _composio_connected()
    overrides = _overrides()
    out = []
    for it in CATALOG:
        key = it["key"]
        # connected if Composio reports a real account, unless the user overrode it
        connected = overrides.get(key, key in real)
        out.append({**it, "connected": bool(connected)})
    return out


def set_connected(key: str, connected: bool) -> dict | None:
    if not any(it["key"] == key for it in CATALOG):
        return None
    overrides = _overrides()
    overrides[key] = bool(connected)
    _save_overrides(overrides)
    return next({**it, "connected": bool(connected)} for it in CATALOG if it["key"] == key)
