from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field
from email.utils import parseaddr
from typing import Any, TypedDict


DEFAULT_USER_ID = "email_support_user"


class EmailSupportState(TypedDict, total=False):
    user_id: str
    connected_account_id: str | None
    message_id: str | None
    thread_id: str | None
    subject: str
    sender: str
    to: str | None
    message_text: str
    trigger_payload: dict[str, Any]
    fetched_email: dict[str, Any]
    fetch_result: Any
    trust: dict[str, Any]
    intent: str
    decision: str
    reasons: list[str]
    draft_body: str | None
    draft_result: dict[str, Any] | None
    message_claim: dict[str, Any] | None
    notion_row_payload: dict[str, Any] | None
    notion_row: dict[str, Any] | None
    dry_run: bool


@dataclass
class EmailFacts:
    subject: str
    sender: str
    to: str | None
    body: str
    message_id: str | None
    thread_id: str | None


@dataclass
class GraphRunResult:
    decision: str
    intent: str
    reasons: list[str]
    message_id: str | None
    thread_id: str | None
    subject: str
    sender: str
    draft_body: str | None = None
    draft_result: dict[str, Any] | None = None
    notion_row_payload: dict[str, Any] | None = None
    notion_row: dict[str, Any] | None = None
    dry_run: bool = False
    final_state: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data.pop("final_state", None)
        return data


def default_user_id() -> str:
    """Return the Composio user id used by the demo."""
    return os.getenv("COMPOSIO_USER_ID", DEFAULT_USER_ID)


def email_address(value: str | None) -> str | None:
    _, address = parseaddr(value or "")
    return address.lower() if "@" in address else None


def sender_first_name(value: str | None) -> str | None:
    name, _ = parseaddr(value or "")
    first = name.strip().split(" ", 1)[0]
    return first if first and "@" not in first else None


def extract_email_facts(state: EmailSupportState) -> EmailFacts:
    """Normalize trigger and fetched-email fields into one object."""
    email = state.get("fetched_email") or {}
    return EmailFacts(
        subject=str(email.get("subject") or state.get("subject") or ""),
        sender=str(email.get("sender") or email.get("from") or state.get("sender") or ""),
        to=str(email.get("to") or state.get("to") or "") or None,
        body=str(email.get("message_text") or email.get("body") or state.get("message_text") or ""),
        message_id=str(email.get("message_id") or email.get("id") or state.get("message_id") or "") or None,
        thread_id=str(email.get("thread_id") or email.get("threadId") or state.get("thread_id") or "") or None,
    )


def state_from_webhook_payload(payload: dict[str, Any], *, dry_run: bool = False) -> EmailSupportState:
    """Convert a Composio Gmail trigger payload into graph state."""
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    return {
        "user_id": str(metadata.get("user_id") or default_user_id()),
        "connected_account_id": metadata.get("connected_account_id"),
        "message_id": data.get("message_id") or data.get("id"),
        "thread_id": data.get("thread_id"),
        "subject": str(data.get("subject") or ""),
        "sender": str(data.get("sender") or ""),
        "to": data.get("to"),
        "message_text": str(data.get("message_text") or ""),
        "trigger_payload": payload,
        "dry_run": dry_run,
    }
