#!/usr/bin/env python3
"""Discover Composio's trigger API and enable a Slack 'new message' trigger.

Inbound chat needs Composio to deliver Slack message events to our webhook. This
script (1) prints the available trigger methods, (2) lists Slack trigger types so we
see the exact slug, and (3) attempts to create the message trigger for our user_id.

Usage:
  uv run python tools/setup_slack_trigger.py            # discover + list
  uv run python tools/setup_slack_trigger.py --create SLACK_RECEIVE_MESSAGE
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.composio_client import get_composio
from app.config import settings


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--create", help="trigger slug to create for this user_id")
    args = ap.parse_args()

    composio = get_composio()
    if composio is None:
        print("✗ no Composio client (COMPOSIO_API_KEY?)")
        return

    trig = getattr(composio, "triggers", None)
    print("composio.triggers methods:", [m for m in dir(trig) if not m.startswith("_")] if trig else None)

    # 1) try to list Slack trigger types so we learn the real slug
    print("\n--- listing Slack trigger types ---")
    for name in ("list_enum", "list", "types", "list_types"):
        fn = getattr(trig, name, None)
        if not callable(fn):
            continue
        for kwargs in ({"toolkits": ["slack"]}, {"toolkit_slugs": ["slack"]}, {"app": "slack"}, {}):
            try:
                res = fn(**kwargs)
                items = getattr(res, "items", None) or res
                slugs = []
                for it in (items or []):
                    slugs.append(getattr(it, "slug", None) or getattr(it, "name", None) or it)
                slugs = [s for s in slugs if "SLACK" in str(s).upper()] or slugs
                print(f"  {name}({kwargs}) -> {slugs[:15]}")
                break
            except Exception as e:
                print(f"  {name}({kwargs}) ✗ {type(e).__name__}: {str(e)[:120]}")

    # 2) optionally create the trigger
    if args.create:
        print(f"\n--- creating trigger {args.create} for user_id={settings.user_id!r} ---")
        fn = getattr(trig, "create", None)
        for kwargs in (
            {"slug": args.create, "user_id": settings.user_id},
            {"slug": args.create, "user_id": settings.user_id, "trigger_config": {}},
            {"trigger_type": args.create, "user_id": settings.user_id},
        ):
            try:
                res = fn(**kwargs)
                print(f"  ✓ created: {res}")
                return
            except Exception as e:
                print(f"  ✗ create({list(kwargs)}) {type(e).__name__}: {str(e)[:160]}")


if __name__ == "__main__":
    main()
