#!/usr/bin/env python3
"""Send a real Slack message via Composio to verify the connection works.

Surfaces the actual outcome (delivered, or the exact error) instead of swallowing it.
Tries a few candidate Slack send-action slugs in case the configured one is wrong.

Usage:
  uv run python tools/test_slack_send.py
  uv run python tools/test_slack_send.py --channel "#funnel-watch" --text "hello"
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.composio_client import get_composio
from app.config import settings

CANDIDATE_SLUGS = [
    settings.slack_send_slug,
    "SLACK_SEND_MESSAGE",
    "SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL",
    "SLACK_CHAT_POST_MESSAGE",
    "SLACK_POST_MESSAGE",
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", default=settings.slack_channel)
    ap.add_argument("--user", default=settings.user_id)
    ap.add_argument("--text",
                    default="👋 FunnelWatch here — Slack is connected. Watching your growth and sales funnels.")
    args = ap.parse_args()

    print(f"user_id = {args.user!r}")
    print(f"channel = {args.channel!r}")
    if args.channel and not args.channel.startswith(("#", "C")):
        print("  (note: Slack usually wants a #channel-name or a C0… channel id)")

    composio = get_composio()
    if composio is None:
        print("\n✗ No Composio client — is COMPOSIO_API_KEY set in .env?")
        return

    # Show which accounts Composio thinks are connected (and under which entity).
    try:
        accts = composio.connected_accounts.list()
        items = getattr(accts, "items", None) or accts or []
        names = [getattr(a, "toolkit", None) or getattr(a, "app_name", "?") for a in items]
        print(f"\nconnected accounts seen by Composio: {names or '(none)'}")
    except Exception as e:
        print(f"\ncould not list connected accounts: {type(e).__name__}: {e}")

    print("\nattempting send…")
    seen = set()
    for slug in CANDIDATE_SLUGS:
        if not slug or slug in seen:
            continue
        seen.add(slug)
        try:
            res = composio.tools.execute(
                slug, user_id=args.user,
                arguments={"channel": args.channel, "markdown_text": args.text},
                dangerously_skip_version_check=True,
            )
            ok = getattr(res, "successful", None)
            if ok is None and isinstance(res, dict):
                ok = res.get("successful", res.get("success"))
            print(f"  ✓ [{slug}] sent — successful={ok}")
            print(f"    response: {res}")
            print("\nCheck your Slack channel for the message.")
            return
        except Exception as e:
            print(f"  ✗ [{slug}] {type(e).__name__}: {e}")

    print("\nAll candidate slugs failed. Most common causes:")
    print("  • Slack connected under a different user_id than", repr(args.user))
    print("  • Wrong channel (use a channel the bot is a member of)")
    print("  • The Slack send action slug differs — check the toolkit in the Composio console")


if __name__ == "__main__":
    main()
