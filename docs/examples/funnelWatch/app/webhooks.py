"""Composio webhook receiver: verify → dedup → route by trigger slug.

Verification (fail closed): with COMPOSIO_WEBHOOK_SECRET set, every request must
carry a valid signature — verified via the SDK's ``triggers.parse``, which handles
the ``v1,`` prefix, secret encodings, and replay tolerance. Unsigned requests are
rejected unless GROWTH_PULSE_ALLOW_UNSIGNED=1 explicitly opts local tools
(tools/simulate.py) back in. With no secret configured there is nothing to verify
against (dev); set one in production.

Dedup: Composio deliveries repeat (retries, redeliveries), so every request is
deduped on the ``webhook-id`` header (fallback ``metadata.log_id``) *before* any
side effect — a replayed payment event must not double-count MRR.
"""
from __future__ import annotations

import json
import threading
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from app import durable, normalize
from app.composio_client import get_composio
from app.config import settings
from app.runtime import manager

router = APIRouter()


def verify(raw: bytes, headers) -> None:
    """Enforce the signature policy; raises HTTPException on anything unacceptable."""
    secret = settings.composio_webhook_secret
    if not secret:
        return  # dev: nothing to verify against
    if "webhook-signature" not in headers:
        if settings.allow_unsigned_webhooks:
            return  # explicit opt-in for local, unsigned tools (the simulator)
        raise HTTPException(status_code=401, detail="missing webhook signature")
    composio = get_composio()
    if composio is None:
        # Fail closed: a secret is configured, so never accept unverified events.
        raise HTTPException(status_code=503, detail="signature verification unavailable")
    try:
        composio.triggers.parse(body=raw, headers=headers, verify_secret=secret)
    except Exception:
        raise HTTPException(status_code=401, detail="invalid webhook signature") from None


# trigger_slug prefix -> handler. Add HubSpot/Google Ads here as the slice grows.
HANDLERS = {
    "STRIPE": normalize.handle_stripe,   # billing: trials, MRR, churn, failed payments
    "POSTHOG": normalize.handle_web,     # instrumented web/product analytics
    "GA": normalize.handle_web,
    "WEB": normalize.handle_web,
    "HUBSPOT": normalize.handle_hubspot,  # leads, deals, lifecycle movement
    "GOOGLEADS": normalize.handle_ads,    # spend/click snapshots
    "METAADS": normalize.handle_ads,
    "ADS": normalize.handle_ads,
}


def route(slug: str):
    s = (slug or "").upper()
    for prefix, handler in HANDLERS.items():
        if s.startswith(prefix):
            return handler
    return None


def _delivery_id(headers, payload: dict) -> str | None:
    """Stable id for this delivery: the webhook-id header, else metadata.log_id."""
    return headers.get("webhook-id") or (payload.get("metadata") or {}).get("log_id")


def _handle_lifecycle(slug: str, payload: dict) -> dict:
    """Events about our own plumbing (composio.trigger.disabled, connection expiry).

    A monitoring product must notice when a source dies: silence looks exactly like
    a quiet day. Composio reports it explicitly — surface it as a high-severity
    alert so someone reconnects, instead of the team quietly going blind.
    """
    from app import slack

    volume = manager.volume
    volume.append_jsonl("raw/lifecycle_events.jsonl", {
        "received_at": datetime.now(timezone.utc).isoformat(),
        "trigger_slug": slug,
        "data": payload.get("data", {}),
    })
    s = slug.lower()
    if "trigger.disabled" in s or "connected_account" in s:
        slack.send_internal_update(
            volume, "Event source needs attention",
            f"Composio reported `{slug}` — a trigger or connection is down, and events "
            "from that source have stopped. Reconnect it from the dashboard, then "
            "re-run tools/setup_triggers.py.",
            kind="alert", meta={"severity": "high", "source": "composio-lifecycle"})
    return {"status": "handled", "trigger_slug": slug}


@router.post("/webhooks/composio")
async def composio_webhook(request: Request):
    raw = await request.body()
    verify(raw, request.headers)

    payload = json.loads(raw.decode("utf-8"))
    slug = (payload.get("metadata") or {}).get("trigger_slug") or payload.get("type", "")

    # Dedup before any side effect: deliveries repeat.
    delivery_id = _delivery_id(request.headers, payload)
    if delivery_id and durable.seen_delivery(delivery_id):
        return {"status": "duplicate", "trigger_slug": slug}

    # Project lifecycle events (composio.*) arrive on this same URL.
    if slug.lower().startswith("composio."):
        return _handle_lifecycle(slug, payload)

    # Inbound Slack messages → the interactive bot. Its reply path calls the LLM
    # (seconds), so it runs on a worker thread and the webhook acks immediately —
    # a slow answer must never block the event loop or other deliveries.
    from app import slackbot
    if slackbot.is_inbound(slug):
        threading.Thread(target=slackbot.process_inbound,
                         args=(manager.volume, payload), daemon=True).start()
        return {"status": "accepted", "trigger_slug": slug}

    handler = route(slug)
    if handler is None:
        return {"status": "ignored", "trigger_slug": slug}

    row = handler(manager.volume, payload)

    # Ingest is fast (normalize + local append). Analytics, flush, and any alert
    # enrichment run in a coalesced background cycle so the webhook returns instantly.
    from app import orchestrator
    orchestrator.trigger_cycle()

    return {"status": "ok", "trigger_slug": slug, "normalized": row}
