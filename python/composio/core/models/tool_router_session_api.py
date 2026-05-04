"""Small v3.1 Tool Router helpers used until generated clients expose the routes."""

from __future__ import annotations

import typing as t
from urllib.parse import quote

from composio_client.types.tool_router.session_tools_response import (
    SessionToolsResponse,
)

from composio.client import HttpClient

SESSION_TOOLS_PAGE_LIMIT = 500


def list_all_tool_router_session_tools_v31(
    client: HttpClient,
    session_id: str,
) -> t.List[t.Any]:
    tools: t.List[t.Any] = []
    cursor: t.Optional[str] = None
    encoded_session_id = quote(session_id, safe="")

    while True:
        params: t.Dict[str, t.Any] = {"limit": SESSION_TOOLS_PAGE_LIMIT}
        if cursor:
            params["cursor"] = cursor

        response = t.cast(
            SessionToolsResponse,
            client.get(
                f"/api/v3.1/tool_router/session/{encoded_session_id}/tools",
                cast_to=SessionToolsResponse,
                options={"params": params},
            ),
        )
        tools.extend(response.items)
        cursor = getattr(response, "next_cursor", None)
        if not cursor:
            return tools
