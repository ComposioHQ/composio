"""Unit tests for the MCP model's request construction.

Regression coverage for the hackathon Area 5 (MCP lifecycle) findings:

- Tool-only updates must reach the API through ``allowed_tools`` — the update
  endpoint never reads the create-time ``custom_tools`` alias, and tools must
  not be gated behind ``toolkits``.
- ``manually_manage_connections`` must invert into
  ``managed_auth_via_composio`` on update, matching create/generate.
- ``create`` uses the non-deprecated ``allowed_tools`` field.
"""

from unittest.mock import Mock

import pytest

from composio.core.models.mcp import MCP


def _mock_update_response():
    response = Mock()
    response.id = "mcp_123"
    response.name = "test-server"
    response.allowed_tools = ["GITHUB_CREATE_ISSUE"]
    response.auth_config_ids = ["ac_456"]
    return response


@pytest.fixture
def mcp():
    client = Mock()
    client.mcp.update = Mock(return_value=_mock_update_response())
    client.mcp.custom.create = Mock(return_value=_mock_update_response())
    return MCP(client)


def test_update_sends_tool_only_updates_via_allowed_tools(mcp):
    """A tool-only update (no toolkits) must send `allowed_tools`."""
    mcp.update("mcp_123", allowed_tools=["GITHUB_CREATE_ISSUE"])

    mcp._client.mcp.update.assert_called_once_with(
        "mcp_123",
        allowed_tools=["GITHUB_CREATE_ISSUE"],
    )


def test_update_does_not_send_custom_tools_alias(mcp):
    """`custom_tools` is not part of the update contract and is dropped
    server-side; the SDK must never send it."""
    mcp.update(
        "mcp_123",
        toolkits=["github"],
        allowed_tools=["GITHUB_CREATE_ISSUE"],
    )

    call_kwargs = mcp._client.mcp.update.call_args.kwargs
    assert "custom_tools" not in call_kwargs
    assert call_kwargs["allowed_tools"] == ["GITHUB_CREATE_ISSUE"]
    assert call_kwargs["toolkits"] == ["github"]
    assert call_kwargs["auth_config_ids"] == []


def test_update_inverts_manually_manage_connections(mcp):
    """`manually_manage_connections=True` must store
    `managed_auth_via_composio=False`, consistent with create/generate."""
    mcp.update("mcp_123", manually_manage_connections=True)
    assert mcp._client.mcp.update.call_args.kwargs["managed_auth_via_composio"] is False

    mcp.update("mcp_123", manually_manage_connections=False)
    assert mcp._client.mcp.update.call_args.kwargs["managed_auth_via_composio"] is True


def test_update_omits_unset_fields(mcp):
    """A sparse update must only send the fields the caller provided."""
    mcp.update("mcp_123", name="renamed")

    mcp._client.mcp.update.assert_called_once_with("mcp_123", name="renamed")


def test_update_extracts_toolkit_and_auth_config_from_combo_entry(mcp):
    """A `{toolkit, auth_config_id}` entry contributes to both lists,
    matching the documented behavior."""
    mcp.update(
        "mcp_123",
        toolkits=[{"toolkit": "github", "auth_config_id": "ac_456"}],
    )

    call_kwargs = mcp._client.mcp.update.call_args.kwargs
    assert call_kwargs["toolkits"] == ["github"]
    assert call_kwargs["auth_config_ids"] == ["ac_456"]


def test_create_sends_allowed_tools_not_custom_tools(mcp):
    """Create should use the non-deprecated `allowed_tools` field."""
    mcp.create("test-server", toolkits=["github"], allowed_tools=["TOOL_A"])

    call_kwargs = mcp._client.mcp.custom.create.call_args.kwargs
    assert "custom_tools" not in call_kwargs
    assert call_kwargs["allowed_tools"] == ["TOOL_A"]


def test_create_inverts_manually_manage_connections(mcp):
    mcp.create("test-server", toolkits=["github"], manually_manage_connections=True)
    assert (
        mcp._client.mcp.custom.create.call_args.kwargs["managed_auth_via_composio"]
        is False
    )

    mcp.create("test-server", toolkits=["github"], manually_manage_connections=False)
    assert (
        mcp._client.mcp.custom.create.call_args.kwargs["managed_auth_via_composio"]
        is True
    )
