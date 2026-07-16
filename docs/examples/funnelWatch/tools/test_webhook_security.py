#!/usr/bin/env python3
"""Webhook security & correctness tests: signature policy, dedup, lifecycle, async ack.

Self-contained: forces local mode and redirects every datastore into a throwaway temp
dir, so it never touches real data and needs no server or credentials.

Run:
  uv run --with httpx python tools/test_webhook_security.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import time
from pathlib import Path

# Force the offline path and isolate every datastore BEFORE app modules cache paths.
os.environ["GROWTH_PULSE_FORCE_LOCAL"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
_TMP = Path(tempfile.mkdtemp(prefix="webhook-test-"))

from app.config import settings  # noqa: E402

object.__setattr__(settings, "data_root", _TMP)
object.__setattr__(settings, "durable_db", _TMP / "summaries.db")
object.__setattr__(settings, "monitors_file", _TMP / "monitors.json")
# Hermetic: no real keys/secrets from a developer .env may leak into the run.
object.__setattr__(settings, "composio_api_key", "")
object.__setattr__(settings, "openai_api_key", "")
object.__setattr__(settings, "composio_webhook_secret", "")
object.__setattr__(settings, "allow_unsigned_webhooks", False)

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

_passed = 0
_failed = 0


def check(name: str, got, expected) -> None:
    global _passed, _failed
    if got == expected:
        _passed += 1
        print(f"  ✓ {name}")
    else:
        _failed += 1
        print(f"  ✗ {name}\n      got:      {got}\n      expected: {expected}")


def stripe_event(mrr: int = 9900) -> dict:
    return {
        "metadata": {"trigger_slug": "STRIPE_PAYMENT_SUCCEEDED"},
        "data": {"type": "subscription_started", "plan": "Pro", "mrr": mrr},
    }


def outbox(client) -> list[dict]:
    return client.get("/api/recommendations").json().get("outbox", [])


def main() -> int:
    with TestClient(app) as client:
        url = "/webhooks/composio"

        print("SIGNATURE POLICY (fail closed):")
        # No secret configured -> dev mode, unsigned accepted.
        r = client.post(url, json=stripe_event())
        check("no secret: unsigned event accepted", r.json().get("status"), "ok")
        check("normalized row returned", r.json()["normalized"]["plan"], "Pro")

        # Secret configured + unsigned + no opt-in -> rejected outright.
        object.__setattr__(settings, "composio_webhook_secret", "whsec_test")
        r = client.post(url, json=stripe_event())
        check("secret set: unsigned rejected (401)", r.status_code, 401)

        # Secret + a signature header, but verification unavailable -> fail closed.
        r = client.post(url, json=stripe_event(),
                        headers={"webhook-signature": "v1,Zm9v", "webhook-id": "wh_x",
                                 "webhook-timestamp": "0"})
        check("secret set: unverifiable signature fails closed (503)", r.status_code, 503)

        # Explicit local opt-in lets the (unsigned) simulator through.
        object.__setattr__(settings, "allow_unsigned_webhooks", True)
        r = client.post(url, json=stripe_event())
        check("allow-unsigned opt-in: unsigned accepted again", r.json().get("status"), "ok")
        object.__setattr__(settings, "composio_webhook_secret", "")
        object.__setattr__(settings, "allow_unsigned_webhooks", False)

        print("DELIVERY DEDUP (before side effects):")
        headers = {"webhook-id": "wh_dup_1"}
        r1 = client.post(url, json=stripe_event(), headers=headers)
        r2 = client.post(url, json=stripe_event(), headers=headers)
        check("first delivery processed", r1.json().get("status"), "ok")
        check("replayed delivery dropped", r2.json().get("status"), "duplicate")
        r3 = client.post(url, json=stripe_event(),
                         headers={"webhook-id": "wh_dup_2"})
        check("same content, new delivery id -> processed", r3.json().get("status"), "ok")
        # metadata.log_id works as the fallback dedup key.
        ev = stripe_event()
        ev["metadata"]["log_id"] = "log_abc"
        client.post(url, json=ev)
        r = client.post(url, json=ev)
        check("log_id fallback dedups too", r.json().get("status"), "duplicate")

        print("LIFECYCLE EVENTS (the product must notice its sources dying):")
        before = len([o for o in outbox(client) if o.get("kind") == "alert"])
        r = client.post(url, json={
            "metadata": {"trigger_slug": "composio.trigger.disabled"},
            "data": {"trigger_id": "ti_123", "reason": "connected account expired"},
        })
        check("lifecycle event handled", r.json().get("status"), "handled")
        after = len([o for o in outbox(client) if o.get("kind") == "alert"])
        check("high-severity alert recorded", after, before + 1)

        print("SLACK INBOUND (ack immediately, reply in background):")
        msgs_before = len([o for o in outbox(client) if o.get("kind") == "message"])
        t0 = time.monotonic()
        r = client.post(url, json={
            "metadata": {"trigger_slug": "SLACK_RECEIVE_MESSAGE"},
            "data": {"text": "what's our MRR today?", "channel": "#funnel-watch",
                     "user": "U_TEST", "ts": "1000.1"},
        })
        elapsed = time.monotonic() - t0
        check("webhook acks without waiting for the reply", r.json().get("status"), "accepted")
        check("ack is immediate (<1s)", elapsed < 1.0, True)
        # A question produces TWO outbox messages: the "on it" ack, then the reply.
        # Wait for both so the loop-guard baseline below is stable.
        deadline = time.monotonic() + 10
        replied = False
        while time.monotonic() < deadline:
            msgs = [o for o in outbox(client) if o.get("kind") == "message"]
            if len(msgs) >= msgs_before + 2:
                replied = True
                break
            time.sleep(0.2)
        check("ack + reply land in the outbox from the worker thread", replied, True)

        # Loop guard still holds: the bot's own message is ignored (no new reply).
        msgs_before = len([o for o in outbox(client) if o.get("kind") == "message"])
        client.post(url, json={
            "metadata": {"trigger_slug": "SLACK_RECEIVE_MESSAGE"},
            "data": {"text": "ignored", "channel": "#funnel-watch",
                     "bot_id": "B_SELF", "ts": "1000.2"},
        })
        time.sleep(0.5)
        msgs_after = len([o for o in outbox(client) if o.get("kind") == "message"])
        check("bot messages don't produce replies (loop guard)", msgs_after, msgs_before)

    print(f"\n{_passed} passed, {_failed} failed")
    return 1 if _failed else 0


if __name__ == "__main__":
    sys.exit(main())
