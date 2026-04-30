"""Small v3.1 Tool Router helpers used until generated clients expose the fields."""

from __future__ import annotations

import typing as t
from urllib.parse import quote

from composio_client.types.tool_router.session_create_response import (
    SessionCreateResponse,
)
from composio_client.types.tool_router.session_tools_response import (
    SessionToolsResponse,
)

from composio.client import HttpClient

DIRECT_TOOLS_PRESET = "direct_tools"
SESSION_TOOLS_PAGE_LIMIT = 500


def _get_field(value: t.Any, field: str) -> t.Any:
    if value is None:
        return None
    if isinstance(value, dict):
        return value.get(field)

    fields_set = getattr(value, "model_fields_set", None)
    if isinstance(fields_set, set) and field not in fields_set:
        return None

    field_value = getattr(value, field, None)
    if field_value.__class__.__module__.startswith("unittest.mock"):
        return None
    return field_value


def get_session_preset(config: t.Any) -> t.Optional[str]:
    preset = _get_field(config, "session_preset")
    return DIRECT_TOOLS_PRESET if preset == DIRECT_TOOLS_PRESET else None


def create_tool_router_session_v31(
    client: HttpClient,
    create_params: t.Dict[str, t.Any],
) -> SessionCreateResponse:
    return t.cast(
        SessionCreateResponse,
        client.post(
            "/api/v3.1/tool_router/session",
            cast_to=SessionCreateResponse,
            body=create_params,
        ),
    )


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
