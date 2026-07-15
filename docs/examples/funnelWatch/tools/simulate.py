#!/usr/bin/env python3
"""Mock SaaS event simulator (built for Composio) — drives the full pipeline offline.

Emits two families of Composio-trigger-shaped events to the webhook:
  - Web / product analytics (instrumented): visit, signup, activation
  - HubSpot CRM: attributed lead creation
  - Ads: spend/click snapshots
  - Stripe billing: trial_started, subscription_started, payment_succeeded/failed, churned

Funnel events are generated as linked user journeys, so the funnel stays monotonic
(Visits >= Signups >= Activations >= Trials >= Paid) like a real one. Billing invoices
are emitted in the background; --spike raises the share that fail past the 5% monitor.

Examples:
  python tools/simulate.py --seed-history        # write prior-week durable summaries
  python tools/simulate.py                       # live day with Meta lead-quality mismatch
  python tools/simulate.py --count 600 --spike   # push failed-payment rate past 5%
"""
from __future__ import annotations

import argparse
import random
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import durable

# plan -> monthly MRR in cents
PLANS = {"Starter": 2900, "Pro": 9900, "Enterprise": 49900}
PLAN_WEIGHTS = [("Starter", 0.5), ("Pro", 0.35), ("Enterprise", 0.15)]
# enterprise rarely churns (lower logo churn for higher tiers)
CHURN_PLAN_WEIGHTS = [("Starter", 0.7), ("Pro", 0.25), ("Enterprise", 0.05)]
SOURCES = ["Organic", "Google Ads", "Docs", "GitHub", "Referral"]
CAMPAIGNS = {
    "Organic": ["brand-search", "direct"],
    "Google Ads": ["search-intent", "competitor"],
    "Docs": ["developer-docs"],
    "GitHub": ["repo-readme"],
    "Referral": ["partner"],
    "Meta Ads": ["summer-demo"],
}
# instrumented CTAs/buttons on the site, with relative click popularity
CTA_WEIGHTS = [("Get Started", 0.28), ("View Docs", 0.22), ("Start Building", 0.18),
               ("Pricing", 0.14), ("Book a Demo", 0.10), ("Get Paid", 0.08)]
CLICKS_PER_VISIT = [(0, 0.5), (1, 0.38), (2, 0.12)]

# funnel conversion rates (each stage conditional on the previous)
SIGNUP_RATE = 0.11
ACTIVATE_RATE = 0.55
TRIAL_RATE = 0.60
CONVERT_RATE = 0.45
# billing background (per journey tick)
INVOICE_RATE = 0.55
CHURN_RATE = 0.010


def _pick(weighted):
    r, cum = random.random(), 0.0
    for name, w in weighted:
        cum += w
        if r <= cum:
            return name
    return weighted[0][0]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def web_event(kind: str, source: str, campaign: str, account_id: str | None = None,
              visitor_id: str | None = None, element: str | None = None) -> dict:
    data = {"event": kind, "source": source, "campaign": campaign, "timestamp": _now(),
            "visitor_id": visitor_id or f"vis_{uuid.uuid4().hex[:10]}", "account_id": account_id}
    if element:
        data["element"] = element
    return {
        "metadata": {"trigger_slug": "POSTHOG_CAPTURE_EVENT", "trigger_instance_id": "ti_sim"},
        "data": data,
    }


def lead_event(source: str, campaign: str, account_id: str | None = None, segment: str = "SMB") -> dict:
    return {
        "metadata": {"trigger_slug": "HUBSPOT_CONTACT_CREATED", "trigger_instance_id": "ti_sim"},
        "data": {"type": "lead_created", "source": source, "campaign": campaign,
                 "account_id": account_id or f"acct_{uuid.uuid4().hex[:12]}",
                 "lead_id": f"lead_{uuid.uuid4().hex[:10]}", "segment": segment,
                 "created": _now()},
    }


def ad_event(source: str, campaign: str, spend_cents: int, clicks: int, impressions: int) -> dict:
    slug = "METAADS_CAMPAIGN_SNAPSHOT" if source == "Meta Ads" else "GOOGLEADS_CAMPAIGN_SNAPSHOT"
    return {
        "metadata": {"trigger_slug": slug, "trigger_instance_id": "ti_sim"},
        "data": {"type": "ad_snapshot", "source": source, "campaign": campaign,
                 "spend": spend_cents, "clicks": clicks, "impressions": impressions,
                 "timestamp": _now()},
    }


def stripe_event(kind: str, plan: str, source: str = "unknown", campaign: str = "unattributed",
                 account_id: str | None = None) -> dict:
    slug = {
        "trial_started": "STRIPE_CUSTOMER_SUBSCRIPTION_TRIAL_STARTED",
        "subscription_started": "STRIPE_CUSTOMER_SUBSCRIPTION_CREATED",
        "subscription_churned": "STRIPE_CUSTOMER_SUBSCRIPTION_DELETED",
        "payment_succeeded": "STRIPE_INVOICE_PAYMENT_SUCCEEDED",
        "payment_failed": "STRIPE_INVOICE_PAYMENT_FAILED",
    }[kind]
    return {
        "metadata": {"trigger_slug": slug, "trigger_instance_id": "ti_sim"},
        "data": {"type": kind, "plan": plan, "mrr": PLANS[plan],
                 "account_id": account_id or f"acct_{uuid.uuid4().hex[:12]}",
                 "source": source, "campaign": campaign, "created": _now()},
    }


def seed_history(days: int = 7) -> None:
    """Write compact previous-day summaries to durable SQLite for baseline comparisons."""
    today = date.today()
    for offset in range(days, 0, -1):
        day = (today - timedelta(days=offset)).isoformat()
        jitter = random.randint(-3, 3)
        meta_leads = 50
        meta_paid = 8
        meta_mrr = meta_paid * 99
        sources = [
            _summary_source("Meta Ads", meta_leads, meta_paid, meta_mrr, 900 + jitter * 8, 42 + jitter),
            _summary_source("Google Ads", 44 + jitter, 10, 1420, 760, 38),
            _summary_source("Organic", 32, 9, 1210, 0, 55),
            _summary_source("Docs", 18, 5, 690, 0, 24),
            _summary_source("Referral", 12, 3, 397, 0, 11),
        ]
        durable.save_daily_summary(day, {
            "session_date": day,
            "new_mrr": sum(s["new_mrr"] for s in sources),
            "net_new_mrr": sum(s["new_mrr"] for s in sources) - 120,
            "new_subscriptions": sum(s["new_subscriptions"] for s in sources),
            "churned": 2,
            "trial_conv_pct": 44.0,
            "signups": 155 + jitter,
            "signup_conv_pct": 10.5,
            "failed_rate_pct": 1.4,
            "leader": "Pro",
            "top_plans": [],
            "source_performance": {
                "sources": sources,
                "campaigns": [
                    {**s, "campaign": CAMPAIGNS[s["source"]][0]} for s in sources
                ],
            },
            "top_insights": [],
        })
    print(f"Seeded {days} durable daily summaries in {durable.settings.durable_db}")


def _summary_source(source: str, leads: int, paid: int, mrr: float, spend: float, signups: int) -> dict:
    return {
        "source": source,
        "visits": signups * 9,
        "signups": signups,
        "activations": round(signups * 0.55),
        "leads": leads,
        "trials": max(paid + 5, round(leads * 0.35)),
        "new_subscriptions": paid,
        "new_mrr": mrr,
        "spend": spend,
        "lead_to_paid_pct": round(100 * paid / leads, 1) if leads else 0,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8000/webhooks/composio")
    ap.add_argument("--count", type=int, default=400, help="number of visit journeys")
    ap.add_argument("--scenario", choices=["lead-quality", "healthy", "payment-spike"],
                    default="lead-quality")
    ap.add_argument("--seed-history", action="store_true",
                    help="seed previous week's compact summaries before sending live events")
    ap.add_argument("--spike", action="store_true",
                    help="raise share of failed invoices to breach the 5%% monitor")
    ap.add_argument("--seed", type=int, default=None)
    args = ap.parse_args()

    if args.seed is not None:
        random.seed(args.seed)
    # Baselines are required for correlation insights (lead-quality, spend efficiency).
    # Seed them automatically when none exist so a default run shows real insights.
    if args.seed_history or not durable.load_recent_summaries():
        seed_history()
    if args.spike:
        args.scenario = "payment-spike"
    fail_frac = 0.16 if args.scenario == "payment-spike" else 0.012

    sent, errors = 0, 0

    def post(ev):
        nonlocal sent, errors
        try:
            requests.post(args.url, json=ev, timeout=10)
            sent += 1
        except requests.RequestException as e:
            errors += 1
            if errors <= 3:
                print(f"  ! {e}")

    for i in range(args.count):
        source = random.choice(SOURCES)
        campaign = random.choice(CAMPAIGNS[source])
        plan = _pick(PLAN_WEIGHTS)
        account_id = f"acct_{uuid.uuid4().hex[:12]}"
        visitor_id = f"vis_{uuid.uuid4().hex[:10]}"
        # acquisition funnel as a linked journey
        post(web_event("visit", source, campaign, account_id, visitor_id))
        for _ in range(_pick(CLICKS_PER_VISIT)):       # CTA/button clicks during the visit
            post(web_event("click", source, campaign, account_id, visitor_id, element=_pick(CTA_WEIGHTS)))
        if random.random() < SIGNUP_RATE:
            post(web_event("signup", source, campaign, account_id, visitor_id))
            if random.random() < ACTIVATE_RATE:
                post(web_event("activation", source, campaign, account_id, visitor_id))
                if random.random() < TRIAL_RATE:
                    post(stripe_event("trial_started", plan, source, campaign, account_id))
                    if random.random() < CONVERT_RATE:
                        post(stripe_event("subscription_started", plan, source, campaign, account_id))
        if random.random() < 0.10:
            post(lead_event(source, campaign, account_id))
        # background billing: recurring invoices (the failed-rate denominator)
        if random.random() < INVOICE_RATE:
            kind = "payment_failed" if random.random() < fail_frac else "payment_succeeded"
            post(stripe_event(kind, _pick(PLAN_WEIGHTS), source, campaign))
        if random.random() < CHURN_RATE:
            post(stripe_event("subscription_churned", _pick(CHURN_PLAN_WEIGHTS), source, campaign))

        if (i + 1) % 50 == 0:
            print(f"  journeys {i + 1}/{args.count} · {sent} events sent")

    # Post ad-spend snapshots first, so spend is attributed before scenario insights
    # fire (otherwise a correlation insight can be phrased against $0 spend and cached).
    post(ad_event("Google Ads", "search-intent", spend_cents=76000, clicks=360, impressions=22000))
    if args.scenario == "lead-quality":
        # Controlled live Meta Ads mismatch: 69 leads vs a 50-lead baseline (+38%),
        # spend ~$980, but paid conversions remain flat at 8.
        post(ad_event("Meta Ads", "summer-demo", spend_cents=98000, clicks=410, impressions=43000))
        for i in range(69):
            account_id = f"acct_meta_{i:03d}"
            post(lead_event("Meta Ads", "summer-demo", account_id, segment="SMB"))
        for i in range(8):
            account_id = f"acct_meta_paid_{i:03d}"
            post(web_event("visit", "Meta Ads", "summer-demo", account_id))
            post(web_event("signup", "Meta Ads", "summer-demo", account_id))
            post(web_event("activation", "Meta Ads", "summer-demo", account_id))
            post(stripe_event("trial_started", "Pro", "Meta Ads", "summer-demo", account_id))
            post(stripe_event("subscription_started", "Pro", "Meta Ads", "summer-demo", account_id))

    print(f"Done. scenario={args.scenario} journeys={args.count} events={sent} errors={errors}")


if __name__ == "__main__":
    main()
