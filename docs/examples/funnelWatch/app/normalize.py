"""Turn raw trigger payloads into normalized rows in the volume.

SaaS model (built for Composio): two event families.
  - Stripe billing  -> normalized/subscription_events.jsonl  (trials, new MRR, churn, failed)
  - Web/product analytics (instrumented) -> normalized/funnel_events.jsonl (visit, signup, activation)
  - HubSpot CRM -> normalized/lead_events.jsonl (leads, lifecycle movement)
  - Ads platforms -> normalized/ad_events.jsonl (spend/click snapshots)

Each handler appends the raw payload and a normalized row. Adding a source = add a
handler and register its trigger-slug prefix in webhooks.py.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.volume import Volume

RAW_STRIPE = "raw/stripe_events.jsonl"
RAW_WEB = "raw/web_events.jsonl"
RAW_HUBSPOT = "raw/hubspot_events.jsonl"
RAW_ADS = "raw/ad_events.jsonl"
SUBSCRIPTION_EVENTS = "normalized/subscription_events.jsonl"
FUNNEL_EVENTS = "normalized/funnel_events.jsonl"
LEAD_EVENTS = "normalized/lead_events.jsonl"
AD_EVENTS = "normalized/ad_events.jsonl"

SUB_TYPES = {"trial_started", "subscription_started", "subscription_churned",
             "payment_succeeded", "payment_failed"}
FUNNEL_TYPES = {"visit", "signup", "activation", "click"}
LEAD_TYPES = {"lead_created", "lead_qualified", "deal_created", "deal_won", "deal_lost"}
AD_TYPES = {"ad_snapshot", "campaign_snapshot", "spend_snapshot"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _infer_sub_type(slug: str) -> str | None:
    s = (slug or "").upper()
    if "TRIAL" in s:
        return "trial_started"
    if "PAYMENT_FAILED" in s or ("INVOICE" in s and "FAIL" in s):
        return "payment_failed"
    if "PAYMENT_SUCCEEDED" in s or ("INVOICE" in s and ("PAID" in s or "SUCCEED" in s)):
        return "payment_succeeded"
    if "DELETED" in s or "CANCEL" in s or "CHURN" in s:
        return "subscription_churned"
    if "CREATED" in s or "SUBSCRIPTION" in s:
        return "subscription_started"
    return None


def handle_stripe(volume: Volume, payload: dict) -> dict | None:
    meta = payload.get("metadata", {})
    data = payload.get("data", {}) or {}
    volume.append_jsonl(RAW_STRIPE, {"received_at": _now(), "trigger_slug": meta.get("trigger_slug"), "data": data})

    etype = data.get("type") or _infer_sub_type(meta.get("trigger_slug"))
    if etype not in SUB_TYPES:
        return None
    row = {
        "ts": data.get("created") or _now(),
        "type": etype,
        "plan": data.get("plan") or "Unknown",
        "mrr_cents": int(data.get("mrr", 0) or 0),
        "account_id": data.get("account_id"),
        "source": data.get("source") or "unknown",
        "campaign": data.get("campaign") or "unattributed",
    }
    volume.append_jsonl(SUBSCRIPTION_EVENTS, row)
    return row


def handle_web(volume: Volume, payload: dict) -> dict | None:
    meta = payload.get("metadata", {})
    data = payload.get("data", {}) or {}
    volume.append_jsonl(RAW_WEB, {"received_at": _now(), "trigger_slug": meta.get("trigger_slug"), "data": data})

    etype = data.get("event") or data.get("type")
    if etype not in FUNNEL_TYPES:
        return None
    row = {
        "ts": data.get("timestamp") or _now(),
        "type": etype,
        "source": data.get("source") or "direct",
        "campaign": data.get("campaign") or "unattributed",
        "visitor_id": data.get("visitor_id"),
        "account_id": data.get("account_id"),
    }
    if etype == "click":
        row["element"] = data.get("element") or "Unknown"
    volume.append_jsonl(FUNNEL_EVENTS, row)
    return row


def handle_hubspot(volume: Volume, payload: dict) -> dict | None:
    meta = payload.get("metadata", {})
    data = payload.get("data", {}) or {}
    volume.append_jsonl(RAW_HUBSPOT, {"received_at": _now(), "trigger_slug": meta.get("trigger_slug"), "data": data})

    etype = data.get("event") or data.get("type") or "lead_created"
    if etype not in LEAD_TYPES:
        return None
    row = {
        "ts": data.get("timestamp") or data.get("created") or _now(),
        "type": etype,
        "lead_id": data.get("lead_id"),
        "account_id": data.get("account_id"),
        "source": data.get("source") or "unknown",
        "campaign": data.get("campaign") or "unattributed",
        "segment": data.get("segment") or "unknown",
        "value_cents": int(data.get("value", 0) or 0),
    }
    volume.append_jsonl(LEAD_EVENTS, row)
    return row


def handle_ads(volume: Volume, payload: dict) -> dict | None:
    meta = payload.get("metadata", {})
    data = payload.get("data", {}) or {}
    volume.append_jsonl(RAW_ADS, {"received_at": _now(), "trigger_slug": meta.get("trigger_slug"), "data": data})

    etype = data.get("event") or data.get("type") or "ad_snapshot"
    if etype not in AD_TYPES:
        return None
    row = {
        "ts": data.get("timestamp") or _now(),
        "type": etype,
        "source": data.get("source") or "unknown",
        "campaign": data.get("campaign") or "unattributed",
        "spend_cents": int(data.get("spend", 0) or 0),
        "clicks": int(data.get("clicks", 0) or 0),
        "impressions": int(data.get("impressions", 0) or 0),
    }
    volume.append_jsonl(AD_EVENTS, row)
    return row
