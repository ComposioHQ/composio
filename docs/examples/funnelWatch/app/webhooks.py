"""Composio webhook receiver. Routes events by metadata.trigger_slug."""
from __future__ import annotations

import base64
import hashlib
import hmac

from fastapi import APIRouter, HTTPException, Request

from app import normalize
from app.config import settings
from app.runtime import manager

router = APIRouter()


def signature_ok(headers, body: str) -> bool:
    """Verify a Composio webhook signature: HMAC-SHA256 over id.timestamp.body.

    Enforced only when a secret is configured AND a signature header is present, so
    local tools (simulator, test_slackbot) that post unsigned still work.
    """
    secret = settings.composio_webhook_secret
    signature = headers.get("webhook-signature")
    if not secret or not signature:
        return True  # nothing to verify against

    signing = f"{headers.get('webhook-id', '')}.{headers.get('webhook-timestamp', '')}.{body}"
    # Composio secrets may be raw or 'whsec_<base64>' — try both key encodings.
    ## !! confirm this with rahul, it shouldn't have to try both encodings
    keys = [secret.encode()]
    raw = secret[6:] if secret.startswith("whsec_") else secret
    try:
        keys.append(base64.b64decode(raw))
    except Exception:
        pass
    received = [p.split(",", 1)[1] if "," in p else p for p in signature.split()]
    for key in keys:
        expected = base64.b64encode(hmac.new(key, signing.encode(), hashlib.sha256).digest()).decode()
        if any(hmac.compare_digest(expected, r) for r in received):
            return True
    return False

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


@router.post("/webhooks/composio")
async def composio_webhook(request: Request):
    body = (await request.body()).decode("utf-8")
    if not signature_ok(request.headers, body):
        raise HTTPException(status_code=401, detail="invalid webhook signature")
    import json
    payload = json.loads(body)
    slug = payload.get("metadata", {}).get("trigger_slug", "")

    # Inbound Slack messages → the interactive bot (answer / create alert). No
    # analytics recompute needed; reply is returned (and sent to Slack).
    from app import slackbot
    ## !! rahul: is this necessary? can't it tell 
    if slackbot.is_inbound(slug):
        result = slackbot.process_inbound(manager.volume, payload)
        return {"status": "ok", "trigger_slug": slug, **result}

    handler = route(slug)
    if handler is None:
        return {"status": "ignored", "trigger_slug": slug}

    row = handler(manager.volume, payload)

    # Ingest is fast (normalize + local append). Analytics, flush, and any alert
    # enrichment run in a coalesced background cycle so the webhook returns instantly.
    from app import orchestrator
    orchestrator.trigger_cycle()

    return {"status": "ok", "trigger_slug": slug, "normalized": row}
