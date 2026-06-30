#!/usr/bin/env python3
"""Test the interactive Slackbot without a real Slack workspace.

Posts simulated inbound Slack messages to the webhook (the same shape a Composio
Slack trigger delivers) and prints the bot's reply. Covers both capabilities:
answering questions and creating custom alerts. Verifies alert monitors are created.

Usage:
  uv run python tools/test_slackbot.py
"""
from __future__ import annotations

import argparse

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


def slack_message(text: str, channel: str = "#funnel-watch", user: str = "U_TEST") -> dict:
    return {
        "metadata": {"trigger_slug": "SLACK_RECEIVE_MESSAGE", "trigger_instance_id": "ti_test"},
        "data": {"text": text, "channel": channel, "user": user},
    }


def send(url: str, text: str) -> dict:
    r = requests.post(url, json=slack_message(text), timeout=60)
    return r.json()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8000/webhooks/composio")
    ap.add_argument("--api", default="http://localhost:8000")
    args = ap.parse_args()

    print("=" * 70)
    print("QUESTIONS — the bot should answer using today's analytics")
    print("=" * 70)
    for q in QUESTIONS:
        res = send(args.url, q)
        print(f"\n🧑  {q}")
        print(f"🤖  [{res.get('intent', res.get('status'))}] {res.get('reply', res)}")

    print("\n" + "=" * 70)
    print("ALERTS — the bot should create a custom monitor and confirm")
    print("=" * 70)
    created = []
    for a in ALERTS:
        res = send(args.url, a)
        print(f"\n🧑  {a}")
        print(f"🤖  [{res.get('intent', res.get('status'))}] {res.get('reply', res)}")
        if res.get("monitor_id"):
            created.append(res["monitor_id"])

    # verify the alerts actually landed as monitors
    monitors = requests.get(f"{args.api}/api/monitors", timeout=30).json().get("monitors", [])
    ids = {m["id"] for m in monitors}
    ok = sum(1 for mid in created if mid in ids)
    print("\n" + "=" * 70)
    print(f"RESULT: {len(created)}/{len(ALERTS)} alert messages created a monitor; "
          f"{ok}/{len(created)} confirmed present in /api/monitors.")
    custom = [m for m in monitors if m.get("kind") == "custom"]
    print(f"Custom monitors now configured ({len(custom)}):")
    for m in custom:
        print(f"  • {m['name']}  ({m['frequency']})")


if __name__ == "__main__":
    main()
