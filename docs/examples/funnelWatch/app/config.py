"""Runtime configuration loaded from environment / .env."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _toolkit_versions() -> dict:
    """Optional {"toolkit": "version"} pins from COMPOSIO_TOOLKIT_VERSIONS (JSON)."""
    raw = os.getenv("COMPOSIO_TOOLKIT_VERSIONS", "")
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except ValueError:
        return {}
    if not isinstance(parsed, dict):
        return {}
    return {str(k).lower(): str(v) for k, v in parsed.items()}


@dataclass(frozen=True)
class Settings:
    base_dir: Path = BASE_DIR
    data_root: Path = BASE_DIR / "data"
    monitors_file: Path = BASE_DIR / "monitors.json"
    durable_db: Path = BASE_DIR / "data" / "summaries.db"

    # Agent
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    model: str = os.getenv("GROWTH_PULSE_MODEL", "gpt-5.2")

    # Composio
    composio_api_key: str = os.getenv("COMPOSIO_API_KEY", "")
    composio_webhook_secret: str = os.getenv("COMPOSIO_WEBHOOK_SECRET", "")
    # Accept unsigned webhook requests even when a secret is configured. ONLY for
    # local tools (tools/simulate.py posts unsigned); leave off in production.
    allow_unsigned_webhooks: bool = os.getenv("GROWTH_PULSE_ALLOW_UNSIGNED", "") == "1"
    # Optional {"toolkit": "version"} pins (JSON). Pinning keeps trigger payload and
    # tool schemas stable, and lets manual execution drop the version-check skip.
    toolkit_versions: dict = field(default_factory=_toolkit_versions)
    user_id: str = os.getenv("GROWTH_PULSE_USER_ID", "growth-pulse-demo")
    # Workbench sandbox compute tier: standard | medium | large | xlarge.
    composio_sandbox_size: str = os.getenv("COMPOSIO_SANDBOX_SIZE", "standard")
    # Persisted id of the single long-lived tool-router session (workbench + mount).
    composio_session_file: Path = BASE_DIR / "data" / "composio_session.txt"
    # Set to "1" to force the local in-process volume + analytics even when a
    # Composio key is present (useful for offline demos / tests).
    force_local_volume: bool = os.getenv("GROWTH_PULSE_FORCE_LOCAL", "") == "1"
    # Days of full event data kept in the mount. Aging-out days are summarized to
    # durable storage, then their mount data is pruned.
    mount_retention_days: int = int(os.getenv("GROWTH_PULSE_MOUNT_RETENTION_DAYS", "7"))
    # Days of daily summaries kept in durable storage (~6 months); older ones are dropped.
    durable_retention_days: int = int(os.getenv("GROWTH_PULSE_DURABLE_RETENTION_DAYS", "180"))
    # Composio Slack action used to deliver updates. Use SLACKBOT_SEND_MESSAGE (bot
    # token) to post as the bot; SLACK_SEND_MESSAGE posts as the connected user account.
    slack_send_slug: str = os.getenv("SLACK_SEND_SLUG", "SLACK_SEND_MESSAGE")

    # Slack
    slack_channel: str = os.getenv("SLACK_CHANNEL", "#funnel-watch")
    # The bot's own Slack user id (e.g. "U0123BOT"). When set, the bot only replies
    # when it's @mentioned or DM'd — so you can tag it in any channel it's in instead
    # of it answering every message. Leave blank to reply to all inbound messages.
    slack_bot_user_id: str = os.getenv("SLACK_BOT_USER_ID", "")

    @property
    def has_openai(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def has_composio(self) -> bool:
        return bool(self.composio_api_key)

    @property
    def use_sandbox(self) -> bool:
        """Use Composio's workbench sandbox + storage mount as the workspace."""
        return self.has_composio and not self.force_local_volume


settings = Settings()
