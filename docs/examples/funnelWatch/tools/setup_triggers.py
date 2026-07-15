#!/usr/bin/env python3
"""Provision FunnelWatch's Composio trigger instances — idempotently.

Creating a trigger twice for the same (slug, user) means every event is delivered
twice, so this script checks the active list first and only creates what's missing.
Re-running it is always safe; that's the point. (FunnelWatch is single-user, so a
slug-level check is equivalent to a (slug, user) check here.)

Usage:
  uv run python tools/setup_triggers.py                          # types + active instances
  uv run python tools/setup_triggers.py --create SLACK_RECEIVE_MESSAGE
  uv run python tools/setup_triggers.py --create <SLUG> --config '{"key": "value"}'

Required config for a slug is discoverable: a bare create returns the missing
fields, or inspect the type with `composio.triggers.get_type("<SLUG>").config`.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.composio_client import READ_ONLY_TOOLS, get_composio
from app.config import settings


def list_types(composio) -> None:
    toolkits = list(READ_ONLY_TOOLS)
    print(f"Trigger types for {', '.join(toolkits)}:")
    types = composio.triggers.list(toolkit_slugs=toolkits)
    for item in getattr(types, "items", None) or []:
        print(f"  {getattr(item, 'slug', item)}")


def active_slugs(composio) -> set[str]:
    active = composio.triggers.list_active()
    return {t.trigger_name for t in (getattr(active, "items", None) or [])}


def ensure(composio, slug: str, config: dict | None) -> None:
    """Create the trigger instance only if no active instance of this type exists."""
    if slug in active_slugs(composio):
        print(f"✓ {slug} already active for user {settings.user_id!r} — nothing to do")
        return
    instance = composio.triggers.create(slug=slug, user_id=settings.user_id,
                                        trigger_config=config or {})
    print(f"✓ created {slug}: {getattr(instance, 'trigger_id', instance)}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--create", help="trigger slug to create (idempotent)")
    ap.add_argument("--config", help="trigger_config JSON for --create")
    args = ap.parse_args()

    composio = get_composio()
    if composio is None:
        print("✗ no Composio client (set COMPOSIO_API_KEY)")
        sys.exit(1)

    if args.create:
        ensure(composio, args.create.upper(),
               json.loads(args.config) if args.config else None)
        return

    list_types(composio)
    print(f"\nActive instances for this project:")
    slugs = sorted(active_slugs(composio))
    for slug in slugs or ["(none — create one with --create <SLUG>)"]:
        print(f"  {slug}")


if __name__ == "__main__":
    main()
