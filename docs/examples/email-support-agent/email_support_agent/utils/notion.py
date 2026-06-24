from __future__ import annotations

import os
import time
from datetime import UTC, datetime
from email.utils import parseaddr
from typing import Any

from email_support_agent.utils.state import EmailSupportState, default_user_id
from email_support_agent.utils.tools import (
    NOTION_ARCHIVE_PAGE_TOOL,
    NOTION_INSERT_ROW_TOOL,
    NOTION_QUERY_DATABASE_TOOL,
    NOTION_UPDATE_PAGE_TOOL,
    invoke_tool,
    notion_tool_map,
)
from email_support_agent.utils.workflow import load_workflow_config, workflow_summary_for_state


DEFAULT_NOTION_ENABLED_VALUES = {"1", "true", "yes"}
PENDING_DRAFT_REFERENCE = "Pending draft creation"


def notion_logging_enabled() -> bool:
    return os.getenv("NOTION_LOG_ROWS", "").strip().lower() in DEFAULT_NOTION_ENABLED_VALUES


def _env(name: str, default: str) -> str:
    return os.getenv(name, "").strip() or default


def _property(name: str, type_: str, value: str) -> dict[str, str]:
    return {"name": name, "type": type_, "value": value}


def _plain_notion_text(value: str) -> str:
    return value.replace("_", "-")


def _sender_address(sender: str | None) -> str:
    _, address = parseaddr(sender or "")
    return address or (sender or "")


def _priority(decision: str, intent: str) -> str:
    if decision == "review_pending":
        return "High"
    if intent == "suspicious":
        return "Medium"
    return "Low"


def _company_from_state(state: dict[str, Any]) -> str:
    subject = str(state.get("subject") or "")
    fetched = state.get("fetched_email") if isinstance(state.get("fetched_email"), dict) else {}
    email_subject = str(fetched.get("subject") or subject)
    return email_subject[:80] or "Inbound email"


def _draft_reference(state: dict[str, Any]) -> str:
    draft_result = state.get("draft_result") if isinstance(state.get("draft_result"), dict) else {}
    if draft_url := _draft_url_from_result(draft_result):
        return draft_url

    if draft_result.get("skipped_existing_draft"):
        if draft_url := _draft_url_from_result(draft_result.get("existing_draft")):
            return draft_url
        thread_id = draft_result.get("thread_id") or state.get("thread_id")
        if not thread_id:
            return "Existing Gmail draft"
        return _plain_notion_text(
            f"Existing Gmail draft in thread {thread_id}".strip()
        )
    if draft_result.get("dry_run"):
        thread_id = draft_result.get("thread_id") or state.get("thread_id")
        if not thread_id:
            return "Dry-run draft preview"
        return _plain_notion_text(
            f"Dry-run draft for thread {thread_id}".strip()
        )
    if draft_result.get("pending"):
        return PENDING_DRAFT_REFERENCE
    for key in ("draft_id", "id", "message_id", "thread_id"):
        value = draft_result.get(key)
        if value:
            return _plain_notion_text(f"Gmail draft {key}: {value}")
    if state.get("decision") == "review_pending":
        return "Gmail draft created for human review"
    return "No draft"


def _draft_url_from_result(value: Any) -> str | None:
    if isinstance(value, dict):
        display_url = value.get("display_url")
        if isinstance(display_url, str) and display_url.startswith("https://"):
            return display_url
        for child in value.values():
            if found := _draft_url_from_result(child):
                return found
    if isinstance(value, list):
        for child in value:
            if found := _draft_url_from_result(child):
                return found
    return None


def build_notion_row_payload(state: dict[str, Any]) -> dict[str, Any]:
    reasons = state.get("reasons") if isinstance(state.get("reasons"), list) else []
    intent = str(state.get("intent") or "")
    decision = str(state.get("decision") or "")
    sender = str(state.get("sender") or "")
    fetched = state.get("fetched_email") if isinstance(state.get("fetched_email"), dict) else {}
    sender = str(fetched.get("sender") or fetched.get("from") or sender)
    message_id = str(state.get("message_id") or fetched.get("message_id") or fetched.get("id") or "").strip()
    date_value = datetime.now(UTC).date().isoformat()
    why = "; ".join(str(reason) for reason in reasons)[:1500] or f"Decision: {decision or 'unknown'}"
    properties = [
        _property(_env("NOTION_DATE_PROPERTY", "Date"), "date", date_value),
        _property(_env("NOTION_COMPANY_PROPERTY", "Company"), _env("NOTION_COMPANY_PROPERTY_TYPE", "title"), _company_from_state(state)),
        _property(_env("NOTION_PRIORITY_PROPERTY", "Priority"), "select", _priority(decision, intent)),
        _property(_env("NOTION_FROM_PROPERTY", "From"), "rich_text", _sender_address(sender)),
        _property(_env("NOTION_DRAFT_LINK_PROPERTY", "Draft Link"), _env("NOTION_DRAFT_LINK_PROPERTY_TYPE", "rich_text"), _draft_reference(state)),
        _property(_env("NOTION_WHY_PROPERTY", "Why?"), "rich_text", why),
    ]
    if message_id:
        properties.append(_property(_env("NOTION_MESSAGE_ID_PROPERTY", "Message ID"), "rich_text", message_id))

    return {
        "database_id": os.getenv("NOTION_DATABASE_ID", "").strip(),
        "properties": properties,
    }


def upsert_notion_row_payload(payload: dict[str, Any], *, user_id: str, dry_run: bool = False) -> dict[str, Any]:
    if not notion_logging_enabled():
        return {"skipped": True, "reason": "NOTION_LOG_ROWS is not enabled."}

    if not payload["database_id"]:
        return {"skipped": True, "reason": "NOTION_DATABASE_ID is not configured.", "payload": payload}

    if dry_run:
        return {"dry_run": True, "payload": payload}

    tools = notion_tool_map(user_id)
    message_id = _payload_value(payload, _env("NOTION_MESSAGE_ID_PROPERTY", "Message ID"))
    if message_id:
        existing = _find_rows_by_message_id(payload, tools, message_id)
        if existing:
            page_id = str(existing[0].get("id") or "")
            if not page_id:
                raise RuntimeError("Existing Notion row did not include a page id")
            updated = _update_notion_message_row_with_tools(payload, tools, page_id)
            normalized = updated if isinstance(updated, dict) else {"raw": str(updated)}
            normalized["upsert"] = {
                "operation": "update",
                "message_id": message_id,
                "page_id": page_id,
            }
            if len(existing) > 1 and "fallback_reinsert" not in normalized:
                normalized["dedupe"] = _archive_duplicate_rows(payload, tools, message_id, keep_page_id=page_id)
            return normalized

    tool = tools.get(NOTION_INSERT_ROW_TOOL)
    if not tool:
        raise RuntimeError(f"{NOTION_INSERT_ROW_TOOL} was not available in the scoped session")

    result = invoke_tool(tool, payload)
    normalized = result if isinstance(result, dict) else {"raw": str(result)}
    normalized["upsert"] = {"operation": "insert", "message_id": message_id or None}
    if message_id:
        # Give concurrently inserted rows a chance to become queryable, then collapse them.
        time.sleep(float(os.getenv("NOTION_DEDUPE_SETTLE_SECONDS", "2")))
        normalized["dedupe"] = _archive_duplicate_rows(payload, tools, message_id)
    return normalized


def insert_notion_row_payload(payload: dict[str, Any], *, user_id: str, dry_run: bool = False) -> dict[str, Any]:
    return upsert_notion_row_payload(payload, user_id=user_id, dry_run=dry_run)


def claim_notion_message_row(state: dict[str, Any], *, user_id: str, dry_run: bool = False) -> dict[str, Any]:
    if not notion_logging_enabled():
        return {"acquired": True, "skipped": True, "reason": "NOTION_LOG_ROWS is not enabled."}

    claim_state = {
        **state,
        "draft_result": {"pending": True},
    }
    payload = build_notion_row_payload(claim_state)
    message_id = _payload_value(payload, _env("NOTION_MESSAGE_ID_PROPERTY", "Message ID"))
    if not payload["database_id"] or not message_id:
        # Without a database id and Gmail message id we cannot dedupe. Proceed (fail open)
        # but make clear that duplicate protection is not active so callers do not assume it.
        return {
            "acquired": True,
            "skipped": True,
            "duplicate_protection": False,
            "reason": "Notion duplicate protection unavailable (missing database id or Gmail message id).",
            "payload": payload,
        }

    if dry_run:
        return {"acquired": True, "dry_run": True, "payload": payload, "message_id": message_id}

    tools = notion_tool_map(user_id)
    existing = _find_rows_by_message_id(payload, tools, message_id)
    blocking = _blocking_rows(existing)
    if blocking:
        return {
            "acquired": False,
            "duplicate": True,
            "reason": "Notion row already exists for this Gmail message.",
            "message_id": message_id,
            "existing_rows": blocking,
        }

    # Only stale placeholder claim rows remain (a crashed earlier run); clear them so they
    # do not accumulate and re-claim the message.
    _archive_rows(tools, [row for row in existing if row not in blocking])

    insert_tool = tools.get(NOTION_INSERT_ROW_TOOL)
    if not insert_tool:
        raise RuntimeError(f"{NOTION_INSERT_ROW_TOOL} was not available in the scoped session")
    result = invoke_tool(insert_tool, payload)
    row_id = _page_id_from_result(result)
    if not row_id:
        # The insert tool failed to return a page id. Treat this as a tooling failure, not a
        # duplicate, so support handling is not silently dropped.
        return {
            "acquired": True,
            "claim_failed": True,
            "duplicate_protection": False,
            "reason": "Notion claim insert did not return a page id; proceeding without duplicate protection.",
            "message_id": message_id,
            "insert_result": result if isinstance(result, dict) else {"raw": str(result)},
        }

    time.sleep(float(os.getenv("NOTION_CLAIM_SETTLE_SECONDS", "2")))
    rows = _find_rows_by_message_id(payload, tools, message_id)
    if not any(row.get("id") == row_id for row in rows):
        # Our own insert is not yet queryable (eventual consistency). Trust the insert rather
        # than archiving it and dropping the message as a false duplicate.
        return {
            "acquired": True,
            "claim_unverified": True,
            "reason": "Inserted Notion claim row not yet queryable; proceeding without re-verification.",
            "message_id": message_id,
            "row_id": row_id,
            "insert_result": result if isinstance(result, dict) else {"raw": str(result)},
        }

    # Among rows that actually compete for the claim (ignoring stale placeholders), the
    # earliest row wins so concurrent deliveries converge on a single owner.
    active_ids = [row.get("id") for row in _blocking_rows(rows)]
    acquired = bool(active_ids and active_ids[0] == row_id)

    if acquired:
        _archive_duplicate_rows(payload, tools, message_id, keep_page_id=row_id)
    else:
        archive_tool = tools.get(NOTION_ARCHIVE_PAGE_TOOL)
        if archive_tool:
            invoke_tool(archive_tool, {"page_id": row_id, "archive": True})

    return {
        "acquired": acquired,
        "duplicate": not acquired,
        "message_id": message_id,
        "row_id": row_id,
        "rows": rows,
        "insert_result": result if isinstance(result, dict) else {"raw": str(result)},
    }


def claim_notion_message_node(state: EmailSupportState) -> EmailSupportState:
    """Claim the Gmail message in Notion before drafting."""
    claim = claim_notion_message_row(
        dict(state),
        user_id=state.get("user_id") or default_user_id(),
        dry_run=bool(state.get("dry_run")),
    )
    if claim.get("acquired") is False:
        return {
            "message_claim": claim,
            "decision": "duplicate_skipped",
            "draft_body": None,
            "draft_result": None,
        }
    return {"message_claim": claim}


def prepare_notion_row_node(state: EmailSupportState) -> EmailSupportState:
    """Build the Notion tracking row payload."""
    workflow = load_workflow_config()
    return {
        "notion_row_payload": build_notion_row_payload(
            {**dict(state), "workflow": workflow_summary_for_state(workflow.markdown)}
        )
    }


def write_notion_row_node(state: EmailSupportState) -> EmailSupportState:
    """Write or update the Notion tracking row."""
    payload = state.get("notion_row_payload") or {}
    claim = state.get("message_claim") if isinstance(state.get("message_claim"), dict) else {}
    if claim and claim.get("acquired") is False:
        return {
            "notion_row": {
                "skipped": True,
                "reason": "Duplicate Gmail trigger delivery skipped; existing Notion row is authoritative.",
                "message_id": claim.get("message_id"),
                "existing_rows": claim.get("existing_rows") or claim.get("rows") or [],
            }
        }

    row_id = str(claim.get("row_id") or "")
    if row_id and claim.get("acquired") is not False:
        result = update_notion_message_row(
            payload,
            page_id=row_id,
            user_id=state.get("user_id") or default_user_id(),
            dry_run=bool(state.get("dry_run")),
        )
    else:
        result = upsert_notion_row_payload(
            payload,
            user_id=state.get("user_id") or default_user_id(),
            dry_run=bool(state.get("dry_run")),
        )
    return {"notion_row": result}


def update_notion_message_row(payload: dict[str, Any], *, page_id: str, user_id: str, dry_run: bool = False) -> dict[str, Any]:
    if not notion_logging_enabled():
        return {"skipped": True, "reason": "NOTION_LOG_ROWS is not enabled."}
    if dry_run:
        return {"dry_run": True, "page_id": page_id, "payload": payload}
    tools = notion_tool_map(user_id)
    return _update_notion_message_row_with_tools(payload, tools, page_id)


def _update_notion_message_row_with_tools(payload: dict[str, Any], tools: dict[str, Any], page_id: str) -> dict[str, Any]:
    update_tool = tools.get(NOTION_UPDATE_PAGE_TOOL)
    if not update_tool:
        raise RuntimeError(f"{NOTION_UPDATE_PAGE_TOOL} was not available in the scoped session")
    update_result = invoke_tool(update_tool, {"page_id": page_id, "properties": _update_properties(payload)})

    time.sleep(float(os.getenv("NOTION_UPDATE_VERIFY_SECONDS", "1")))
    updated_row = _find_row_by_page_id(payload, tools, page_id)
    if updated_row and _row_matches_payload(updated_row, payload):
        return update_result if isinstance(update_result, dict) else {"raw": str(update_result)}

    # Some Composio Notion update runs report success but leave database properties unchanged.
    # In that case, replace the placeholder claim row with a final row so the visible table is correct.
    fallback = _replace_claim_row_with_final_row(payload, tools, page_id)
    return {
        "successful": bool(fallback.get("successful")),
        "update_result": update_result if isinstance(update_result, dict) else {"raw": str(update_result)},
        "fallback_reinsert": fallback,
        "reason": "NOTION_UPDATE_PAGE did not persist the expected properties.",
    }


def _payload_value(payload: dict[str, Any], property_name: str) -> str:
    for item in payload.get("properties") or []:
        if item.get("name") == property_name:
            return str(item.get("value") or "").strip()
    return ""


def _page_id_from_result(result: Any) -> str | None:
    if not isinstance(result, dict):
        return None
    for candidate in (result, result.get("data") if isinstance(result.get("data"), dict) else None):
        if isinstance(candidate, dict) and candidate.get("id"):
            return str(candidate["id"])
    return None


def _update_properties(payload: dict[str, Any]) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for item in payload.get("properties") or []:
        name = item.get("name")
        type_ = item.get("type")
        value = str(item.get("value") or "")
        if not name:
            continue
        if type_ == "title":
            output[name] = {"title": [{"text": {"content": value}}]}
        elif type_ == "rich_text":
            output[name] = {"rich_text": [{"text": {"content": value}}]}
        elif type_ == "select":
            output[name] = {"select": {"name": value}}
        elif type_ == "date":
            output[name] = {"date": {"start": value}}
        elif type_ == "url":
            output[name] = {"url": value}
    return output


def _result_rows(result: Any) -> list[dict[str, Any]]:
    if not isinstance(result, dict):
        return []
    for candidate in (result, result.get("data") if isinstance(result.get("data"), dict) else None):
        if isinstance(candidate, dict) and isinstance(candidate.get("results"), list):
            return [row for row in candidate["results"] if isinstance(row, dict)]
    return []


def _result_next_cursor(result: Any) -> str | None:
    if not isinstance(result, dict):
        return None
    for candidate in (result, result.get("data") if isinstance(result.get("data"), dict) else None):
        if isinstance(candidate, dict) and candidate.get("has_more"):
            cursor = candidate.get("next_cursor")
            if isinstance(cursor, str) and cursor:
                return cursor
    return None


def _claim_ttl_seconds() -> float:
    try:
        return float(os.getenv("NOTION_CLAIM_TTL_SECONDS", "900"))
    except ValueError:
        return 900.0


def _row_age_seconds(row: dict[str, Any]) -> float | None:
    created = row.get("created_time")
    if not isinstance(created, str) or not created:
        return None
    try:
        timestamp = datetime.fromisoformat(created.replace("Z", "+00:00"))
    except ValueError:
        return None
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=UTC)
    return (datetime.now(UTC) - timestamp).total_seconds()


def _is_pending_claim_row(row: dict[str, Any]) -> bool:
    return str(row.get("draft_link") or "").strip() == PENDING_DRAFT_REFERENCE


def _blocking_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Rows that should block a new claim.

    A completed row (real prior handling) always blocks. A pending placeholder row blocks
    only while it is within the claim TTL, i.e. an in-flight concurrent delivery. Stale
    placeholder rows left by a crashed run no longer block redelivery.
    """
    ttl = _claim_ttl_seconds()
    blocking: list[dict[str, Any]] = []
    for row in rows:
        if _is_pending_claim_row(row):
            age = _row_age_seconds(row)
            if age is not None and age > ttl:
                continue
        blocking.append(row)
    return blocking


def _archive_rows(tools: dict[str, Any], rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    archive_tool = tools.get(NOTION_ARCHIVE_PAGE_TOOL)
    if not archive_tool:
        return
    for row in rows:
        page_id = row.get("id")
        if page_id:
            invoke_tool(archive_tool, {"page_id": page_id, "archive": True})


def _find_rows_by_message_id(payload: dict[str, Any], tools: dict[str, Any], message_id: str) -> list[dict[str, Any]]:
    query_tool = tools.get(NOTION_QUERY_DATABASE_TOOL)
    if not query_tool:
        return []
    property_name = _env("NOTION_MESSAGE_ID_PROPERTY", "Message ID")
    draft_link_property = _env("NOTION_DRAFT_LINK_PROPERTY", "Draft Link")
    matches: list[dict[str, Any]] = []
    start_cursor: str | None = None
    # Paginate the whole database so rows beyond the first page are still deduped once the
    # inbox grows past a single 100-row window.
    for _ in range(int(os.getenv("NOTION_QUERY_MAX_PAGES", "50"))):
        query: dict[str, Any] = {
            "database_id": payload["database_id"],
            "page_size": 100,
            "sorts": [{"property_name": "created_time", "ascending": True}],
        }
        if start_cursor:
            query["start_cursor"] = start_cursor
        result = invoke_tool(query_tool, query)
        for row in _result_rows(result):
            if row.get("id") and _row_property_text(row, property_name) == message_id:
                matches.append(
                    {
                        "id": row.get("id"),
                        "url": row.get("url"),
                        "created_time": row.get("created_time"),
                        "draft_link": _row_property_text(row, draft_link_property),
                    }
                )
        start_cursor = _result_next_cursor(result)
        if not start_cursor:
            break
    return matches


def _find_row_by_page_id(payload: dict[str, Any], tools: dict[str, Any], page_id: str) -> dict[str, Any] | None:
    query_tool = tools.get(NOTION_QUERY_DATABASE_TOOL)
    if not query_tool:
        return None
    result = invoke_tool(
        query_tool,
        {
            "database_id": payload["database_id"],
            "page_size": 100,
            "sorts": [{"property_name": "created_time", "ascending": True}],
        },
    )
    for row in _result_rows(result):
        if row.get("id") == page_id:
            return row
    return None


def _row_property_text(row: dict[str, Any], property_name: str) -> str:
    properties = row.get("properties") if isinstance(row.get("properties"), dict) else {}
    prop = properties.get(property_name) if isinstance(properties, dict) else None
    if not isinstance(prop, dict):
        return ""
    values = prop.get("rich_text") or prop.get("title") or []
    if not isinstance(values, list):
        return ""
    return "".join(str(item.get("plain_text") or "") for item in values if isinstance(item, dict)).strip()


def _row_matches_payload(row: dict[str, Any], payload: dict[str, Any]) -> bool:
    properties = row.get("properties") if isinstance(row.get("properties"), dict) else {}
    for item in payload.get("properties") or []:
        name = str(item.get("name") or "")
        type_ = str(item.get("type") or "")
        expected = str(item.get("value") or "")
        if not name:
            continue
        prop = properties.get(name) if isinstance(properties, dict) else None
        if not isinstance(prop, dict):
            return False
        if type_ in {"title", "rich_text"}:
            if _row_property_text(row, name) != expected:
                return False
        elif type_ == "select":
            if str((prop.get("select") or {}).get("name") or "") != expected:
                return False
        elif type_ == "date":
            if str((prop.get("date") or {}).get("start") or "") != expected:
                return False
        elif type_ == "url":
            if str(prop.get("url") or "") != expected:
                return False
    return True


def _replace_claim_row_with_final_row(payload: dict[str, Any], tools: dict[str, Any], page_id: str) -> dict[str, Any]:
    archive_tool = tools.get(NOTION_ARCHIVE_PAGE_TOOL)
    insert_tool = tools.get(NOTION_INSERT_ROW_TOOL)
    if not archive_tool or not insert_tool:
        return {
            "successful": False,
            "reason": "Archive or insert tool unavailable for claim-row replacement.",
        }

    archive_result = invoke_tool(archive_tool, {"page_id": page_id, "archive": True})
    insert_result = invoke_tool(insert_tool, payload)
    normalized = insert_result if isinstance(insert_result, dict) else {"raw": str(insert_result)}
    normalized["archived_claim_row"] = page_id
    normalized["archive_result"] = archive_result if isinstance(archive_result, dict) else {"raw": str(archive_result)}

    message_id = _payload_value(payload, _env("NOTION_MESSAGE_ID_PROPERTY", "Message ID"))
    if message_id:
        time.sleep(float(os.getenv("NOTION_DEDUPE_SETTLE_SECONDS", "2")))
        keep_page_id = _page_id_from_result(insert_result)
        normalized["dedupe"] = _archive_duplicate_rows(payload, tools, message_id, keep_page_id=keep_page_id)
    return normalized


def _archive_duplicate_rows(
    payload: dict[str, Any],
    tools: dict[str, Any],
    message_id: str,
    *,
    keep_page_id: str | None = None,
) -> dict[str, Any]:
    rows = _find_rows_by_message_id(payload, tools, message_id)
    if len(rows) <= 1:
        return {"duplicates_found": 0, "archived": []}

    archive_tool = tools.get(NOTION_ARCHIVE_PAGE_TOOL)
    if not archive_tool:
        return {"duplicates_found": len(rows) - 1, "archived": [], "reason": "Archive tool unavailable."}

    if keep_page_id:
        rows_to_archive = [row for row in rows if row.get("id") != keep_page_id]
    else:
        rows_to_archive = rows[1:]

    archived: list[str] = []
    for row in rows_to_archive:
        page_id = row.get("id")
        if not page_id:
            continue
        invoke_tool(archive_tool, {"page_id": page_id, "archive": True})
        archived.append(str(page_id))
    return {"duplicates_found": len(rows_to_archive), "archived": archived, "kept": keep_page_id or rows[0].get("id")}


def insert_notion_row(state: dict[str, Any], *, user_id: str, dry_run: bool = False) -> dict[str, Any]:
    return upsert_notion_row_payload(
        build_notion_row_payload(state),
        user_id=user_id,
        dry_run=dry_run,
    )
