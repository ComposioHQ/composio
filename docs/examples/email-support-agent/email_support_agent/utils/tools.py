from __future__ import annotations

from typing import Any

from composio import Composio
from composio_langgraph import LanggraphProvider


FETCH_TOOL = "GMAIL_FETCH_EMAILS"
DRAFT_TOOL = "GMAIL_CREATE_EMAIL_DRAFT"
SAFE_GMAIL_TOOLS = [FETCH_TOOL, DRAFT_TOOL]

NOTION_INSERT_ROW_TOOL = "NOTION_INSERT_ROW_DATABASE"
NOTION_QUERY_DATABASE_TOOL = "NOTION_QUERY_DATABASE"
NOTION_ARCHIVE_PAGE_TOOL = "NOTION_ARCHIVE_NOTION_PAGE"
NOTION_UPDATE_PAGE_TOOL = "NOTION_UPDATE_PAGE"
SAFE_NOTION_TOOLS = [
    NOTION_INSERT_ROW_TOOL,
    NOTION_QUERY_DATABASE_TOOL,
    NOTION_ARCHIVE_PAGE_TOOL,
    NOTION_UPDATE_PAGE_TOOL,
]


def gmail_tool_map(user_id: str) -> dict[str, Any]:
    """Create a scoped Composio Gmail session for fetching emails and drafting replies."""
    session = Composio(provider=LanggraphProvider()).create(
        user_id=user_id,
        # Limit this runtime session to Gmail, and then further to the safe
        # fetch/draft tools below. The Notion session is created separately.
        toolkits=["gmail"],
        tools={"gmail": {"enable": SAFE_GMAIL_TOOLS}},
        preload={"tools": SAFE_GMAIL_TOOLS},
        workbench={"enable": False},
    )
    return {getattr(tool, "name", ""): tool for tool in session.tools()}


def notion_tool_map(user_id: str) -> dict[str, Any]:
    """Create a scoped Composio Notion session for support row tracking."""
    session = Composio(provider=LanggraphProvider()).create(
        user_id=user_id,
        # Keep Notion row tracking scoped away from the Gmail drafting session.
        toolkits=["notion"],
        tools={"notion": {"enable": SAFE_NOTION_TOOLS}},
        preload={"tools": SAFE_NOTION_TOOLS},
        workbench={"enable": False},
    )
    return {getattr(tool, "name", ""): tool for tool in session.tools()}


def invoke_tool(tool: Any, args: dict[str, Any]) -> Any:
    """Run a Composio tool across LangChain/LangGraph wrapper variants."""
    return tool.invoke(args) if hasattr(tool, "invoke") else tool.run(args)
