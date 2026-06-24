from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request
import webbrowser
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from composio import Composio
from composio_langgraph import LanggraphProvider
from dotenv import load_dotenv

from _env import update_env


# Composio Webhook Subscriptions API:
# https://docs.composio.dev/reference/api-reference/webhook-subscriptions/postWebhookSubscriptions
WEBHOOK_SUBSCRIPTIONS_URL = "https://backend.composio.dev/api/v3.1/webhook_subscriptions"
GMAIL_TRIGGER_SLUG = "GMAIL_NEW_GMAIL_MESSAGE"
NOTION_PAGE_TITLE = "Email Support Agent"
NOTION_DATABASE_TITLE = "Email Support Inbox"
NOTION_SETUP_TOOLS = [
    "NOTION_SEARCH_NOTION_PAGE",
    "NOTION_CREATE_NOTION_PAGE",
    "NOTION_CREATE_DATABASE",
    "NOTION_QUERY_DATABASE",
    "NOTION_INSERT_ROW_DATABASE",
]
NOTION_DATABASE_SCHEMA = [
    {"name": "Company", "type": "title"},
    {"name": "Date", "type": "date"},
    {"name": "Priority", "type": "select"},
    {"name": "From", "type": "rich_text"},
    {"name": "Draft Link", "type": "rich_text"},
    {"name": "Why?", "type": "rich_text"},
    {"name": "Message ID", "type": "rich_text"},
]
WEBHOOK_EVENTS = [
    "composio.trigger.message",
    "composio.connected_account.expired",
    "composio.trigger.disabled",
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Set up Composio for the email support workflow.")
    parser.add_argument("webhook_url", help="Public URL ending in /webhook/composio")
    parser.add_argument("--env-file", default=".env")
    parser.add_argument("--replace-webhook", action="store_true", help="Replace the existing project webhook subscription")
    parser.add_argument("--replace-notion", action="store_true", help="Create a fresh Notion page and database even if one is configured")
    parser.add_argument(
        "--setup-langsmith",
        action="store_true",
        help="Create or reuse a LangSmith tracing project and enable tracing in the env file. Optional; omit to skip LangSmith setup.",
    )
    parser.add_argument(
        "--langsmith-project",
        default="",
        help="LangSmith project name to create or reuse",
    )
    args = parser.parse_args()

    load_dotenv(args.env_file)
    api_key = os.getenv("COMPOSIO_API_KEY", "")
    # Demo default: one stable Composio user. In production, use your app's
    # database user UUID/primary key so each real user gets isolated connections.
    user_id = os.getenv("COMPOSIO_USER_ID", "email_support_user")
    if not api_key:
        raise SystemExit("COMPOSIO_API_KEY is required")

    composio = Composio(provider=LanggraphProvider())
    session = _ensure_toolkits_connected(
        composio,
        user_id=user_id,
        toolkits=["gmail", "notion"],
    )

    env_updates = {"COMPOSIO_USER_ID": user_id}
    env_updates.update(
        _ensure_webhook_subscription(
            api_key=api_key,
            webhook_url=args.webhook_url,
            replace=args.replace_webhook,
        )
    )
    env_updates.update(_ensure_gmail_trigger(composio, user_id=user_id))
    env_updates.update(
        _ensure_notion_workspace(
            session=session,
            user_id=user_id,
            replace=args.replace_notion,
        )
    )
    if args.setup_langsmith:
        langsmith_project = args.langsmith_project or os.getenv(
            "LANGSMITH_PROJECT",
            "email-support-agent",
        )
        env_updates.update(_ensure_langsmith_project(project_name=langsmith_project))

    update_env(Path(args.env_file), env_updates)

    print("\nComposio setup complete.")
    print(f"Updated {args.env_file} with setup values.")
    print("Keep the app server and ngrok running, then send an email to the connected Gmail inbox.")


def _ensure_toolkits_connected(
    composio: Composio,
    *,
    user_id: str,
    toolkits: list[str],
) -> Any:
    """Authorize all toolkits in one session: print all links first, then wait for all."""
    preload_tools = NOTION_SETUP_TOOLS if "notion" in toolkits else []
    session = composio.create(
        user_id=user_id,
        toolkits=toolkits,
        preload={"tools": preload_tools} if preload_tools else {},
        workbench={"enable": False},
    )

    # Check which toolkits still need auth
    pending_auths: list[tuple[str, Any]] = []
    for toolkit in toolkits:
        if _toolkit_is_active(session, toolkit):
            print(f"{toolkit.title()} is already connected for {user_id}.")
        else:
            auth = session.authorize(toolkit)
            url = _find_url(_jsonable(auth))
            if not url:
                raise SystemExit(f"No Connect Link was found for {toolkit}.")
            print(f"\nOpen this Connect Link to connect {toolkit.title()} for {user_id}:\n{url}\n")
            webbrowser.open(url)
            pending_auths.append((toolkit, auth))

    # Wait for all pending auths after printing all links
    for toolkit, auth in pending_auths:
        if hasattr(auth, "wait_for_connection"):
            print(f"Waiting for {toolkit.title()} OAuth to complete...")
            auth.wait_for_connection()
            print(f"{toolkit.title()} connected.")
        else:
            input(f"Press Enter after {toolkit.title()} OAuth completes...")

    return session


def _ensure_webhook_subscription(*, api_key: str, webhook_url: str, replace: bool) -> dict[str, str]:
    existing_id = os.getenv("COMPOSIO_WEBHOOK_SUBSCRIPTION_ID", "")
    existing_url = os.getenv("COMPOSIO_WEBHOOK_URL", "")
    existing_secret = os.getenv("COMPOSIO_WEBHOOK_SECRET", "")

    if existing_id and existing_secret and existing_url == webhook_url and not replace:
        print(f"Using existing webhook subscription {existing_id}.")
        return {}

    subscriptions = _list_webhook_subscriptions(api_key)
    if replace:
        for subscription in subscriptions:
            subscription_id = str(subscription.get("id") or "")
            if subscription_id:
                _delete_webhook_subscription(api_key, subscription_id)
                print(f"Deleted webhook subscription {subscription_id}.")
    elif subscriptions:
        details = "\n".join(
            f"- {item.get('id')}: {item.get('webhook_url')}" for item in subscriptions
        )
        raise SystemExit(
            "Composio already has a webhook subscription for this project.\n"
            "Deleting triggers does not delete the project webhook subscription.\n"
            "Use the existing webhook URL, delete the old subscription, or rerun with --replace-webhook.\n"
            f"Existing subscription(s):\n{details}"
        )

    response = _post_json(
        WEBHOOK_SUBSCRIPTIONS_URL,
        api_key,
        {
            "webhook_url": webhook_url,
            "enabled_events": WEBHOOK_EVENTS,
            "version": "V3",
        },
    )
    subscription_id = str(response.get("id", ""))
    secret = str(response.get("secret", ""))
    if not subscription_id or not secret:
        raise SystemExit("Webhook subscription response did not include an id and secret.")

    print(f"Created webhook subscription {subscription_id}.")
    return {
        "COMPOSIO_WEBHOOK_URL": webhook_url,
        "COMPOSIO_WEBHOOK_SUBSCRIPTION_ID": subscription_id,
        "COMPOSIO_WEBHOOK_SECRET": secret,
    }


def _ensure_gmail_trigger(composio: Composio, *, user_id: str) -> dict[str, str]:
    existing_id = os.getenv("COMPOSIO_GMAIL_TRIGGER_ID", "")
    if existing_id:
        print(f"Using existing Gmail trigger {existing_id}.")
        return {}

    trigger = composio.triggers.create(
        slug=GMAIL_TRIGGER_SLUG,
        # The trigger watches the Gmail connected account for this Composio
        # user. A multi-user app would create/manage this per real user.
        user_id=user_id,
        trigger_config={},
    )
    trigger_id = _value_for_key(trigger, ("trigger_id", "triggerId", "id"))
    if not trigger_id:
        print(json.dumps({"trigger": _jsonable(trigger)}, indent=2, default=str))
        raise SystemExit("Gmail trigger response did not include a trigger id.")

    print(f"Created Gmail trigger {trigger_id}.")
    return {"COMPOSIO_GMAIL_TRIGGER_ID": trigger_id}


def _ensure_notion_workspace(*, session: Any, user_id: str, replace: bool) -> dict[str, str]:
    tools = {getattr(tool, "name", ""): tool for tool in session.tools()}
    missing = [t for t in NOTION_SETUP_TOOLS if t not in tools]
    if missing:
        raise SystemExit(f"Missing Notion setup tools: {', '.join(missing)}")

    existing_database_id = os.getenv("NOTION_DATABASE_ID", "").strip()
    if existing_database_id and not replace:
        if _notion_database_is_accessible(tools, existing_database_id):
            print(f"Using existing Notion database {existing_database_id}.")
            return {"NOTION_LOG_ROWS": "true"}
        print(f"Configured Notion database {existing_database_id} is not accessible. Creating a fresh one.")

    parent_page_id = os.getenv("NOTION_PARENT_PAGE_ID", "").strip() or _first_accessible_notion_page_id(tools)
    page = _invoke_tool(
        tools["NOTION_CREATE_NOTION_PAGE"],
        {
            "parent_id": parent_page_id,
            "title": NOTION_PAGE_TITLE,
            "markdown": (
                "# Email Support Agent\n\n"
                "This page and database were created by `scripts/setup_composio.py`.\n"
                "Incoming support emails are logged in the database below.\n"
            ),
        },
    )
    page_data = _result_data(page)
    page_id = str(page_data.get("id") or "")
    if not page_id:
        raise SystemExit(f"Notion page creation did not return a page id: {page}")

    database = _invoke_tool(
        tools["NOTION_CREATE_DATABASE"],
        {
            "parent_id": page_id,
            "title": NOTION_DATABASE_TITLE,
            "properties": NOTION_DATABASE_SCHEMA,
        },
    )
    database_data = _result_data(database)
    database_id = str(database_data.get("id") or database_data.get("database_id") or "")
    if not database_id:
        raise SystemExit(f"Notion database creation did not return a database id: {database}")

    _insert_notion_setup_row(tools, database_id)

    print(f"Created Notion page {page_id}.")
    print(f"Created Notion database {database_id}.")
    return {
        "NOTION_LOG_ROWS": "true",
        "NOTION_PARENT_PAGE_ID": parent_page_id,
        "NOTION_PAGE_ID": page_id,
        "NOTION_DATABASE_ID": database_id,
    }


def _notion_database_is_accessible(tools: dict[str, Any], database_id: str) -> bool:
    try:
        result = _invoke_tool(
            tools["NOTION_QUERY_DATABASE"],
            {
                "database_id": database_id,
                "page_size": 1,
            },
        )
    except Exception as exc:
        print(f"Notion database check failed: {exc}")
        return False
    data = _result_data(result)
    if isinstance(result, dict) and result.get("successful") is False:
        return False
    return bool(result) and not data.get("error")


def _insert_notion_setup_row(tools: dict[str, Any], database_id: str) -> None:
    _invoke_tool(
        tools["NOTION_INSERT_ROW_DATABASE"],
        {
            "database_id": database_id,
            "properties": [
                {"name": "Company", "type": "title", "value": "Setup Smoke Test"},
                {"name": "Date", "type": "date", "value": datetime.now(UTC).date().isoformat()},
                {"name": "Priority", "type": "select", "value": "Low"},
                {"name": "From", "type": "rich_text", "value": "setup@example.com"},
                {"name": "Draft Link", "type": "rich_text", "value": "Setup created the Notion database."},
                {"name": "Why?", "type": "rich_text", "value": "Smoke row inserted by setup_composio.py."},
                {"name": "Message ID", "type": "rich_text", "value": f"setup-{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}"},
            ],
        },
    )

def _first_accessible_notion_page_id(tools: dict[str, Any]) -> str:
    result = _invoke_tool(
        tools["NOTION_SEARCH_NOTION_PAGE"],
        {
            "query": "",
            "filter_value": "page",
            "page_size": 10,
        },
    )
    for page in _result_rows(result):
        if page.get("object") == "page" and not page.get("archived") and page.get("id"):
            return str(page["id"])
    raise SystemExit(
        "No accessible Notion parent page was found. Share one Notion page with the connected integration and rerun setup."
    )


def _ensure_langsmith_project(*, project_name: str) -> dict[str, str]:
    api_key = os.getenv("LANGSMITH_API_KEY", "")
    if not api_key:
        raise SystemExit("LANGSMITH_API_KEY is required")

    from langsmith import Client

    client = Client(
        api_key=api_key,
        api_url=os.getenv("LANGSMITH_ENDPOINT") or None,
    )
    existed = client.has_project(project_name)
    client.create_project(
        project_name,
        description="LangGraph traces for the Composio email support agent example.",
        metadata={"example": "email-support-agent-composio"},
        upsert=True,
    )

    action = "Using existing" if existed else "Created"
    print(f"{action} LangSmith project {project_name}.")
    return {
        "LANGSMITH_TRACING": "true",
        "LANGSMITH_PROJECT": project_name,
    }


def _post_json(url: str, api_key: str, body: dict[str, object]) -> dict[str, object]:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "x-api-key": api_key,
            "content-type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise RuntimeError(f"Composio API returned {exc.code}: {detail}") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("Composio API returned a non-object response")
    return payload


def _list_webhook_subscriptions(api_key: str) -> list[dict[str, Any]]:
    request = urllib.request.Request(
        WEBHOOK_SUBSCRIPTIONS_URL,
        headers={"x-api-key": api_key},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise RuntimeError(f"Composio API returned {exc.code}: {detail}") from exc
    items = payload.get("items", []) if isinstance(payload, dict) else []
    return [item for item in items if isinstance(item, dict)]


def _delete_webhook_subscription(api_key: str, subscription_id: str) -> None:
    request = urllib.request.Request(
        f"{WEBHOOK_SUBSCRIPTIONS_URL}/{subscription_id}",
        headers={"x-api-key": api_key},
        method="DELETE",
    )
    try:
        with urllib.request.urlopen(request, timeout=30):
            return
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise RuntimeError(f"Composio API returned {exc.code}: {detail}") from exc


def _toolkit_is_active(session: Any, slug: str) -> bool:
    for item in _toolkit_items(session, slug):
        item_slug = _attr(item, "slug") or str(_attr(item, "name") or "").lower()
        if item_slug != slug:
            continue
        connection = _attr(item, "connection")
        if bool(_attr(connection, "is_active")):
            return True
    return False


def _toolkit_items(session: Any, slug: str) -> list[Any]:
    try:
        result = session.toolkits(toolkits=[slug])
    except TypeError:
        result = session.toolkits()
    except Exception:
        return []

    items = _attr(result, "items")
    return items if isinstance(items, list) else []


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "__dict__"):
        return {key: item for key, item in vars(value).items() if not key.startswith("_")}
    return str(value)


def _invoke_tool(tool: Any, args: dict[str, Any]) -> Any:
    return tool.invoke(args) if hasattr(tool, "invoke") else tool.run(args)


def _result_data(result: Any) -> dict[str, Any]:
    if isinstance(result, dict):
        data = result.get("data")
        return data if isinstance(data, dict) else result
    return result.model_dump() if hasattr(result, "model_dump") else {}


def _result_rows(result: Any) -> list[dict[str, Any]]:
    data = _result_data(result)
    rows = data.get("results")
    return [row for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []


def _find_url(value: Any) -> str | None:
    if isinstance(value, str) and value.startswith("http"):
        return value
    if isinstance(value, dict):
        for item in value.values():
            if found := _find_url(item):
                return found
    if isinstance(value, list):
        for item in value:
            if found := _find_url(item):
                return found
    return None


def _value_for_key(value: Any, keys: tuple[str, ...]) -> str:
    payload = _jsonable(value)
    if isinstance(payload, dict):
        for key in keys:
            if payload.get(key):
                return str(payload[key])
    for key in keys:
        if attr := _attr(value, key):
            return str(attr)
    return ""


def _attr(value: Any, name: str) -> Any:
    if isinstance(value, dict):
        return value.get(name)
    return getattr(value, name, None)


if __name__ == "__main__":
    main()
