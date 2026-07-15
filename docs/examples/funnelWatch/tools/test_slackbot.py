#!/usr/bin/env python3
"""Test the interactive Slackbot without a real Slack workspace.

Posts simulated inbound Slack messages to the webhook (the same shape a Composio
Slack trigger delivers) and reads the bot's replies from the outbox. The webhook
acks inbound chat immediately and replies from a worker thread, so this script
polls /api/recommendations (which exposes the outbox) rather than expecting the
reply in the webhook response. Verifies alert messages create monitors.

Usage:
  uv run python tools/test_slackbot.py
"""
from __future__ import annotations

import argparse
import time

import requests

QUESTIONS = [
    "What's our new MRR today?",
    "How many visitors clicked the Get Paid button?",
    "Which acquisition source looks problematic right now?",
]
ALERTS = [
    "alert me if failed payments go above 5%",
    "let me know when churn spikes above 10 in a day",
    "watch whether Meta Ads leads stop converting to paid",
]


def slack_message(text: str, channel: str = "#funnel-watch", user: str = "U_TEST",
                  ts: str | None = None) -> dict:
    return {
        "metadata": {"trigger_slug": "SLACK_RECEIVE_MESSAGE", "trigger_instance_id": "ti_test"},
        "data": {"text": text, "channel": channel, "user": user,
                 "ts": ts or str(time.time())},
    }


def outbox_messages(api: str) -> list[dict]:
    out = requests.get(f"{api}/api/recommendations", timeout=30).json().get("outbox", [])
    return [o for o in out if o.get("kind") == "message"]


def send_and_wait(url: str, api: str, text: str, timeout_s: float = 30.0) -> str:
    """Post an inbound message, then poll the outbox for the bot's reply."""
    before = {(m.get("ts"), m.get("text")) for m in outbox_messages(api)}
    ack = requests.post(url, json=slack_message(text), timeout=30).json()
    if ack.get("status") != "accepted":
        return f"(webhook said: {ack})"
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        fresh = [m for m in outbox_messages(api)
                 if (m.get("ts"), m.get("text")) not in before
                 and not (m.get("text") or "").startswith("🔎")]  # skip the "on it" ack
        if fresh:
            return fresh[0].get("text", "")
        time.sleep(0.5)
    return "(no reply within timeout)"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8000/webhooks/composio")
    ap.add_argument("--api", default="http://localhost:8000")
    args = ap.parse_args()

    print("=" * 70)
    print("QUESTIONS — the bot should answer using today's analytics")
    print("=" * 70)
    for q in QUESTIONS:
        reply = send_and_wait(args.url, args.api, q)
        print(f"\n🧑  {q}")
        print(f"🤖  {reply}")

    print("\n" + "=" * 70)
    print("ALERTS — the bot should create a custom monitor and confirm")
    print("=" * 70)
    customs_before = {m["id"] for m in requests.get(f"{args.api}/api/monitors", timeout=30)
                      .json().get("monitors", []) if m.get("kind") == "custom"}
    for a in ALERTS:
        reply = send_and_wait(args.url, args.api, a)
        print(f"\n🧑  {a}")
        print(f"🤖  {reply}")

    # verify the alert messages actually landed as monitors
    monitors = requests.get(f"{args.api}/api/monitors", timeout=30).json().get("monitors", [])
    customs = [m for m in monitors if m.get("kind") == "custom"]
    created = [m for m in customs if m["id"] not in customs_before]
    print("\n" + "=" * 70)
    print(f"RESULT: {len(created)}/{len(ALERTS)} alert messages created a monitor.")
    print(f"Custom monitors now configured ({len(customs)}):")
    for m in customs:
        print(f"  • {m['name']}  ({m['frequency']})")


if __name__ == "__main__":
    main()
