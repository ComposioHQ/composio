from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from composio import Composio

from email_support_agent.agent import run_email_support_graph
from email_support_agent.utils.state import state_from_webhook_payload


TRIGGER_MESSAGE = "composio.trigger.message"
CONNECTED_ACCOUNT_EXPIRED = "composio.connected_account.expired"
TRIGGER_DISABLED = "composio.trigger.disabled"
GMAIL_NEW_MESSAGE_TRIGGER = "GMAIL_NEW_GMAIL_MESSAGE"

if os.getenv("VERCEL"):
    os.environ.setdefault("COMPOSIO_CACHE_DIR", "/tmp/.composio")


class InvalidWebhookError(Exception):
    pass


@dataclass(frozen=True)
class WebhookAction:
    status: str
    event_type: str | None
    action: str
    reason: str
    trigger_slug: str | None = None
    trigger_id: str | None = None
    user_id: str | None = None
    connected_account_id: str | None = None
    message_id: str | None = None
    thread_id: str | None = None
    subject: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "event_type": self.event_type,
            "action": self.action,
            "reason": self.reason,
            "trigger_slug": self.trigger_slug,
            "trigger_id": self.trigger_id,
            "user_id": self.user_id,
            "connected_account_id": self.connected_account_id,
            "message_id": self.message_id,
            "thread_id": self.thread_id,
            "subject": self.subject,
        }


def build_webhook_record(headers: Mapping[str, str], raw_body: bytes) -> dict[str, Any]:
    """Verify, route, and run a Composio webhook payload."""
    try:
        if _env_flag("ALLOW_UNVERIFIED_WEBHOOKS") and not _header(headers, "webhook-signature"):
            payload = parse_unverified_webhook(raw_body)
            verified = False
        else:
            payload = verify_composio_webhook(headers=headers, raw_body=raw_body)
            verified = True
    except Exception as exc:
        raise InvalidWebhookError(f"{type(exc).__name__}: {exc}") from exc

    action = route_webhook_payload(payload)
    graph_result = None
    if action.action == "enqueue_langgraph_email_support":
        graph_state = state_from_webhook_payload(payload, dry_run=_env_flag("LANGGRAPH_DRY_RUN"))
        graph_result = run_email_support_graph(graph_state).to_dict()

    return {
        "verified": verified,
        "action": action.to_dict(),
        "graph_result": graph_result,
        "payload": payload,
    }


def verify_composio_webhook(
    *,
    headers: Mapping[str, str],
    raw_body: bytes,
    secret: str | None = None,
    tolerance: int = 300,
) -> dict[str, Any]:
    """Verify a Composio webhook and return the raw V3 payload."""
    webhook_secret = secret or os.getenv("COMPOSIO_WEBHOOK_SECRET", "")
    if not webhook_secret:
        raise ValueError("COMPOSIO_WEBHOOK_SECRET is required")

    result = Composio().triggers.verify_webhook(
        id=_header(headers, "webhook-id"),
        payload=raw_body.decode("utf-8"),
        signature=_header(headers, "webhook-signature"),
        timestamp=_header(headers, "webhook-timestamp"),
        secret=webhook_secret,
        tolerance=tolerance,
    )
    raw_payload = result.get("raw_payload") if isinstance(result, dict) else None
    if not isinstance(raw_payload, dict):
        raise ValueError("Verified webhook did not include a raw payload")
    return raw_payload


def parse_unverified_webhook(raw_body: bytes) -> dict[str, Any]:
    """Parse a local-only smoke-test payload without signature verification."""
    payload = json.loads(raw_body.decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Webhook payload must be a JSON object")
    return payload


def route_webhook_payload(payload: Mapping[str, Any]) -> WebhookAction:
    """Map Composio webhook payloads to the action this app should take."""
    event_type = payload.get("type")
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), Mapping) else {}
    data = payload.get("data") if isinstance(payload.get("data"), Mapping) else {}

    trigger_slug = metadata.get("trigger_slug")
    trigger_id = metadata.get("trigger_id")
    user_id = metadata.get("user_id")
    connected_account_id = metadata.get("connected_account_id")

    if event_type == TRIGGER_MESSAGE and trigger_slug == GMAIL_NEW_MESSAGE_TRIGGER:
        if "DRAFT" in _label_ids(data):
            return WebhookAction(
                status="ignored",
                event_type=event_type,
                action="ignore_gmail_draft_message",
                reason="Gmail trigger payload is a draft message created by this workflow.",
                trigger_slug=str(trigger_slug) if trigger_slug else None,
                trigger_id=str(trigger_id) if trigger_id else None,
                user_id=str(user_id) if user_id else None,
                connected_account_id=str(connected_account_id) if connected_account_id else None,
                message_id=str(data.get("id") or data.get("message_id") or "") or None,
                thread_id=str(data.get("thread_id") or "") or None,
                subject=str(data.get("subject") or "") or None,
            )

        return WebhookAction(
            status="accepted",
            event_type=event_type,
            action="enqueue_langgraph_email_support",
            reason="New Gmail message trigger should wake the LangGraph draft workflow.",
            trigger_slug=str(trigger_slug) if trigger_slug else None,
            trigger_id=str(trigger_id) if trigger_id else None,
            user_id=str(user_id) if user_id else None,
            connected_account_id=str(connected_account_id) if connected_account_id else None,
            message_id=str(data.get("id") or data.get("message_id") or "") or None,
            thread_id=str(data.get("thread_id") or "") or None,
            subject=str(data.get("subject") or "") or None,
        )

    if event_type == TRIGGER_MESSAGE:
        return WebhookAction(
            status="ignored",
            event_type=str(event_type),
            action="ignore_trigger_message",
            reason="Trigger message is not the Gmail new-message trigger this workflow handles.",
            trigger_slug=str(trigger_slug) if trigger_slug else None,
            trigger_id=str(trigger_id) if trigger_id else None,
            user_id=str(user_id) if user_id else None,
            connected_account_id=str(connected_account_id) if connected_account_id else None,
        )

    if event_type == CONNECTED_ACCOUNT_EXPIRED:
        return WebhookAction(
            status="accepted",
            event_type=str(event_type),
            action="mark_gmail_reauth_required",
            reason="Connected account expired; prompt reauthorization before running triggers.",
            user_id=str(user_id) if user_id else None,
            connected_account_id=str(connected_account_id) if connected_account_id else None,
        )

    if event_type == TRIGGER_DISABLED:
        return WebhookAction(
            status="accepted",
            event_type=str(event_type),
            action="mark_trigger_disabled",
            reason="Composio disabled a trigger; inspect trigger health before reenabling.",
            trigger_slug=str(trigger_slug) if trigger_slug else None,
            trigger_id=str(trigger_id) if trigger_id else None,
            user_id=str(user_id) if user_id else None,
            connected_account_id=str(connected_account_id) if connected_account_id else None,
        )

    return WebhookAction(
        status="ignored",
        event_type=str(event_type) if event_type else None,
        action="ignore_unknown_event",
        reason="Webhook event type is not handled by the email support workflow.",
    )


def persist_webhook_record(record: dict[str, Any]) -> None:
    """Append webhook records locally unless running on Vercel without an explicit path."""
    configured_path = os.getenv("WEBHOOK_EVENTS_PATH")
    if not configured_path and os.getenv("VERCEL"):
        return

    path = Path(configured_path or "logs/webhook-events.jsonl")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(record, separators=(",", ":")) + "\n")


def response_body_from_record(record: dict[str, Any]) -> dict[str, Any]:
    """Build the JSON response returned by the webhook endpoint."""
    return {
        "ok": True,
        "verified": record["verified"],
        "action": record["action"],
        "graph_result": record["graph_result"],
    }


def _env_flag(name: str) -> bool:
    return os.getenv(name, "").lower() in {"1", "true", "yes"}


def _header(headers: Mapping[str, str], name: str) -> str:
    target = name.lower()
    for key, value in headers.items():
        if key.lower() == target:
            return value
    return ""


def _label_ids(data: Mapping[str, Any]) -> set[str]:
    labels = data.get("label_ids") or data.get("labelIds") or []
    if not isinstance(labels, list):
        return set()
    return {str(label).upper() for label in labels}
