"""Guard the generated-client response shape the SDK reads by attribute.

Several SDK code paths walk a generated-client response two or more levels deep
-- ``item.meta.logo``, ``item.connected_account.auth_config.id``,
``response.commands.claude``. That only works while the client constructs those
nested objects as models.

The rest of the suite mocks the client with ``MagicMock``, which answers every
attribute regardless of the real response shape, so a client release that stops
building nested models passes here and fails against the live backend instead.
These tests close that gap: they build responses through the *installed*
client's own response models, so a client whose nested fields decay to plain
mappings fails locally.
"""

import typing as t
from unittest.mock import MagicMock

import pytest
from composio_client.types.mcp.custom_create_response import CustomCreateResponse
from composio_client.types.tool_router.session_toolkits_response import (
    SessionToolkitsResponse,
)
from pydantic import BaseModel

from composio.core.models.mcp import MCP
from composio.core.models.tool_router import ToolkitConnectionsDetails, ToolRouter

TOOLKITS_PAYLOAD: t.Dict[str, t.Any] = {
    "current_page": 1,
    "total_items": 2,
    "total_pages": 1,
    "next_cursor": "cursor_789",
    "items": [
        {
            "slug": "gmail",
            "name": "Gmail",
            "enabled": True,
            "is_no_auth": False,
            "composio_managed_auth_schemes": ["OAUTH2"],
            "meta": {"description": "Gmail toolkit", "logo": "https://logo/gmail.png"},
            "connected_account": {
                "id": "conn_123",
                "status": "ACTIVE",
                "created_at": "2026-01-01T00:00:00Z",
                "user_id": "user_123",
                "auth_config": {
                    "id": "auth_config_123",
                    "auth_scheme": "OAUTH2",
                    "is_composio_managed": True,
                },
            },
        },
        {
            "slug": "github",
            "name": "GitHub",
            "enabled": True,
            "is_no_auth": False,
            "composio_managed_auth_schemes": [],
            "meta": {"description": "GitHub toolkit", "logo": "https://logo/gh.png"},
        },
    ],
}

MCP_CREATE_PAYLOAD: t.Dict[str, t.Any] = {
    "id": "mcp_123",
    "name": "test-server",
    "allowed_tools": ["GITHUB_CREATE_ISSUE"],
    "auth_config_ids": ["ac_123"],
    "mcp_url": "https://mcp.composio.dev/mcp_123",
    "commands": {
        "claude": "claude mcp add ...",
        "cursor": "cursor://...",
        "windsurf": "windsurf://...",
    },
}


@pytest.mark.parametrize(
    ("model", "payload", "path"),
    [
        (SessionToolkitsResponse, TOOLKITS_PAYLOAD, "items.0.meta"),
        (SessionToolkitsResponse, TOOLKITS_PAYLOAD, "items.0.connected_account"),
        (
            SessionToolkitsResponse,
            TOOLKITS_PAYLOAD,
            "items.0.connected_account.auth_config",
        ),
        (CustomCreateResponse, MCP_CREATE_PAYLOAD, "commands"),
    ],
)
def test_generated_client_builds_nested_response_models(
    model: t.Type[BaseModel], payload: t.Dict[str, t.Any], path: str
) -> None:
    """A nested response field must arrive as a model, not a bare mapping."""
    root: t.Any = model.model_validate(payload)
    for part in path.split("."):
        root = root[int(part)] if part.isdigit() else getattr(root, part)

    assert isinstance(root, BaseModel), (
        f"{model.__name__}.{path} is a {type(root).__name__}, not a model. The SDK "
        f"reads this field by attribute, so a generated client that leaves nested "
        f"objects as mappings breaks it at runtime."
    )


def _client_with_session() -> MagicMock:
    """A mocked client whose session.create is just real enough to build a session."""
    client = MagicMock()
    session_response = MagicMock()
    session_response.session_id = "session_123"
    session_response.mcp.type = "http"
    session_response.mcp.url = "https://mcp.example.com/session_123"
    session_response.config.preload.tools = []
    session_response.experimental = None
    client.tool_router.session.create.return_value = session_response
    return client


def test_session_toolkits_reads_nested_connection_models() -> None:
    """``Session.toolkits()`` walks meta and connected_account by attribute."""
    client = _client_with_session()
    client.tool_router.session.toolkits.return_value = (
        SessionToolkitsResponse.model_validate(TOOLKITS_PAYLOAD)
    )
    session = ToolRouter(client=client, provider=MagicMock()).create(user_id="user_123")

    result = session.toolkits()

    assert isinstance(result, ToolkitConnectionsDetails)
    gmail, github = result.items

    assert gmail.slug == "gmail"
    assert gmail.logo == "https://logo/gmail.png"
    assert gmail.connection is not None
    assert gmail.connection.is_active is True
    assert gmail.connection.auth_config is not None
    assert gmail.connection.auth_config.id == "auth_config_123"
    assert gmail.connection.auth_config.mode == "OAUTH2"
    assert gmail.connection.auth_config.is_composio_managed is True
    assert gmail.connection.connected_account is not None
    assert gmail.connection.connected_account.id == "conn_123"

    assert github.slug == "github"
    assert github.connection is not None
    assert github.connection.is_active is False
    assert github.connection.auth_config is None


def test_mcp_create_returns_attribute_addressable_commands() -> None:
    """``mcp.create()`` hands callers a ``commands`` object, not a mapping."""
    client = MagicMock()
    client.mcp.custom.create.return_value = CustomCreateResponse.model_validate(
        MCP_CREATE_PAYLOAD
    )

    response = MCP(client=client).create(name="test-server", toolkits=["github"])

    assert response.commands.claude == "claude mcp add ..."
    assert response.commands.cursor == "cursor://..."
    assert response.commands.windsurf == "windsurf://..."
