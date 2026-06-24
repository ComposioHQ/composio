from __future__ import annotations

import os
from typing import Any

from email_support_agent.utils.drafting import draft_support_reply, draft_support_reply_with_llm
from email_support_agent.utils.state import (
    EmailSupportState,
    default_user_id,
    email_address,
    extract_email_facts,
)
from email_support_agent.utils.tools import DRAFT_TOOL, FETCH_TOOL, gmail_tool_map, invoke_tool


def fetch_gmail_trigger_message(state: EmailSupportState) -> EmailSupportState:
    """Fetch the Gmail message that triggered the workflow."""
    subject = state.get("subject") or ""
    message_id = state.get("message_id")
    fetched_email = {
        "id": message_id,
        "message_id": message_id,
        "thread_id": state.get("thread_id"),
        "subject": subject,
        "sender": state.get("sender") or "",
        "to": state.get("to") or "",
        "message_text": state.get("message_text") or "",
    }

    if state.get("dry_run"):
        return {"fetched_email": fetched_email, "fetch_result": {"dry_run": True}}

    tools = gmail_tool_map(state.get("user_id") or default_user_id())
    fetch_tool = tools.get(FETCH_TOOL)
    if not fetch_tool:
        raise RuntimeError(f"{FETCH_TOOL} was not available in the scoped session")

    result = invoke_tool(
        fetch_tool,
        {
            "user_id": "me",
            "query": f'subject:"{subject}"' if subject else "in:inbox newer_than:7d",
            "label_ids": ["INBOX"],
            "max_results": 10,
            "include_payload": True,
            "verbose": True,
        },
    )
    messages = messages_from_fetch_result(result)
    selected = _select_message(
        messages,
        message_id=message_id,
        thread_id=state.get("thread_id"),
        subject=subject,
    )
    return {"fetched_email": {**fetched_email, **(selected or {})}, "fetch_result": result}


def create_gmail_review_draft(state: EmailSupportState) -> EmailSupportState:
    """Create a Gmail draft for human review."""
    facts = extract_email_facts(state)
    if state.get("dry_run"):
        return {
            "draft_body": draft_support_reply(facts),
            "draft_result": {
                "dry_run": True,
                "thread_id": facts.thread_id,
                "recipient_email": email_address(facts.sender),
            },
        }

    tools = gmail_tool_map(state.get("user_id") or default_user_id())
    if existing_draft := _existing_draft_for_thread(tools, facts.thread_id):
        return {
            "draft_body": None,
            "draft_result": {
                "skipped_existing_draft": True,
                "thread_id": facts.thread_id,
                "existing_draft": existing_draft,
            },
        }

    draft_body = (
        draft_support_reply(facts)
        if os.getenv("EMAIL_SUPPORT_DISABLE_LLM_DRAFTS", "").lower() in {"1", "true", "yes"}
        else draft_support_reply_with_llm(facts)
    )
    draft_tool = tools.get(DRAFT_TOOL)
    if not draft_tool:
        raise RuntimeError(f"{DRAFT_TOOL} was not available in the scoped session")

    draft_args = {
        "user_id": "me",
        "recipient_email": email_address(facts.sender),
        "body": draft_body,
        "is_html": False,
        "subject": "" if facts.thread_id else _reply_subject(facts.subject),
        "cc": [],
        "bcc": [],
    }
    if facts.thread_id:
        draft_args["thread_id"] = facts.thread_id

    result = invoke_tool(draft_tool, draft_args)
    return {"draft_body": draft_body, "draft_result": result if isinstance(result, dict) else {"raw": str(result)}}


def messages_from_fetch_result(result: Any) -> list[dict[str, Any]]:
    """Normalize common Gmail fetch response shapes into message dicts."""
    candidates: list[Any] = []
    if isinstance(result, dict):
        for key in ("messages", "items", "emails", "data"):
            value = result.get(key)
            if isinstance(value, list):
                candidates = value
                break
        for key in ("response_data", "data"):
            if not candidates and isinstance(result.get(key), dict):
                return messages_from_fetch_result(result[key])
    elif isinstance(result, list):
        candidates = result

    return [item for item in candidates if isinstance(item, dict)]


def _existing_draft_for_thread(tools: dict[str, Any], thread_id: str | None) -> dict[str, Any] | None:
    fetch_tool = tools.get(FETCH_TOOL)
    if not fetch_tool or not thread_id:
        return None

    result = invoke_tool(
        fetch_tool,
        {
            "user_id": "me",
            "query": "in:drafts newer_than:7d",
            "label_ids": ["DRAFT"],
            "max_results": 20,
            "include_payload": False,
            "verbose": True,
        },
    )
    for message in messages_from_fetch_result(result):
        if thread_id in {message.get("thread_id"), message.get("threadId")}:
            return message
    return None


def _reply_subject(subject: str) -> str:
    cleaned = subject.strip()
    if not cleaned:
        return "Re: Support request"
    if cleaned.lower().startswith("re:"):
        return cleaned
    return f"Re: {cleaned}"


def _select_message(
    messages: list[dict[str, Any]],
    *,
    message_id: str | None,
    thread_id: str | None = None,
    subject: str = "",
) -> dict[str, Any] | None:
    # Prefer an exact id match so we never operate on another thread's content.
    for message in messages:
        if message_id and message_id in {
            message.get("id"),
            message.get("message_id"),
            message.get("messageId"),
        }:
            return message
    for message in messages:
        if thread_id and thread_id in {message.get("thread_id"), message.get("threadId")}:
            return message
    # Only fall back to a fuzzy subject/first-result match when we had no identifier
    # to disambiguate; otherwise an unmatched id means the target is absent and we
    # must not guess.
    if message_id or thread_id:
        return None
    for message in messages:
        if subject and message.get("subject") == subject:
            return message
    return messages[0] if messages else None
