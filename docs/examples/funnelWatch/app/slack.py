"""Internal-only Slack delivery.

Every message is recorded to the volume's slack_outbox.jsonl (shown on the dashboard),
and also sent via the Composio Slack action when configured. The outbox guarantees the
demo is observable even with no Slack/Composio credentials.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.composio_client import get_composio
from app.config import settings
from app.volume import Volume

OUTBOX = "analytics/slack_outbox.jsonl"


def send_internal_update(volume: Volume, title: str, text: str,
                         channel: str | None = None, *,
                         kind: str = "insight", meta: dict | None = None) -> dict:
    """Broadcast an insight/alert to Slack. `kind` ("insight"/"alert"/"monitor") and
    any `meta` (severity, source, evidence, …) are recorded so the dashboard feed can
    render the same item with badges/evidence."""
    channel = channel or settings.slack_channel
    body = f"*{title}*\n\n{text}"
    delivered = _try_composio(channel, body)
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "channel": channel,
        "title": title,
        "text": text,
        "kind": kind,
        "delivered": delivered,
    }
    if meta:
        record.update(meta)
    volume.append_jsonl(OUTBOX, record)
    return record


def send_message(volume: Volume, text: str, channel: str | None = None,
                 title: str = "FunnelWatch") -> dict:
    """Send a plain conversational message (bot replies, startup notices). Tagged
    kind="message" — these stay on Slack and are not surfaced in the dashboard feed."""
    channel = channel or settings.slack_channel
    delivered = _try_composio(channel, text)
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "channel": channel,
        "title": title,
        "text": text,
        "kind": "message",
        "delivered": delivered,
    }
    volume.append_jsonl(OUTBOX, record)
    return record


def _try_composio(channel: str, body: str) -> bool:
    composio = get_composio()
    if composio is None:
        return False
    try:
        composio.tools.execute(
            settings.slack_send_slug,
            user_id=settings.user_id,
            arguments={"channel": channel, "markdown_text": body},
            dangerously_skip_version_check=True,  # required for manual (non-agent) execution
        )
        return True
    except Exception:
        return False
