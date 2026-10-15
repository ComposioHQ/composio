"""Unit tests for the MCP model's request construction.

Regression coverage for the hackathon Area 5 (MCP lifecycle) findings:

- Tool-only updates must reach the API through ``allowed_tools`` — the update
  endpoint never reads the create-time ``custom_tools`` alias, and tools must
  not be gated behind ``toolkits``.
- ``manually_manage_connections`` must invert into
  ``managed_auth_via_composio`` on update, matching create/generate.
- ``create`` uses the non-deprecated ``allowed_tools`` field.
"""

import json
import subprocess
import sys
import typing as t
import warnings
from unittest.mock import Mock

import httpx
import pytest

from composio import ComposioDeprecationWarning
from composio.client import HttpClient
from composio.core.models import mcp as mcp_module
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


def _transport_mcp(requests: t.Optional[t.List[httpx.Request]] = None) -> MCP:
    def handler(request: httpx.Request) -> httpx.Response:
        if requests is not None:
            requests.append(request)
        if request.url.path.endswith("/generate"):
            return httpx.Response(
                200,
                json={
                    "mcp_url": "https://mcp.test",
                    "connected_account_urls": [],
                    "user_ids_url": ["https://mcp.test/u"],
                },
            )
        return httpx.Response(
            200,
            json={
                "id": "mcp_123",
                "name": "server",
                "allowed_tools": [],
                "auth_config_ids": [],
            },
        )

    client = HttpClient(
        provider="test",
        api_key="ak_test",
        base_url="https://backend.composio.dev",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    return MCP(client)


@pytest.fixture
def fresh_managed_auth_notice(monkeypatch):
    monkeypatch.setattr(mcp_module, "_managed_auth_deprecation_warned", False)


def _sdk_notices(caught):
    return [
        w
        for w in caught
        if w.category is ComposioDeprecationWarning
        and "include_composio_helper_actions" in str(w.message)
    ]


def test_generate_warns_once_per_process(fresh_managed_auth_notice):
    """The SDK still sends `managed_auth_by_composio` (deprecated upstream) and
    explains it once in SDK terms, even across call sites and instances."""
    first, second = _transport_mcp(), _transport_mcp()

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        server = first.generate("user_123", "mcp_123")
        first.generate("user_123", "mcp_123")
        second.generate("user_123", "mcp_123")

    assert server["url"] == "https://mcp.test/u"
    notices = _sdk_notices(caught)
    assert len(notices) == 1
    assert notices[0].filename == __file__


def test_generate_without_managed_auth_omits_field_and_does_not_warn(
    fresh_managed_auth_notice,
):
    requests: t.List[httpx.Request] = []
    mcp = _transport_mcp(requests)

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        mcp.generate("user_123", "mcp_123", manually_manage_connections=True)

    assert caught == []
    body = json.loads(requests[-1].content)
    assert "managed_auth_by_composio" not in body


_DEFAULT_FILTERS_SCRIPT = """
import warnings

import httpx

from composio.client import HttpClient
from composio.core.models.mcp import MCP


def handler(request):
    if request.url.path.endswith("/generate"):
        return httpx.Response(
            200, json={"mcp_url": "u", "connected_account_urls": [], "user_ids_url": ["x"]}
        )
    return httpx.Response(
        200, json={"id": "m", "name": "s", "allowed_tools": [], "auth_config_ids": []}
    )


mcp = MCP(
    HttpClient(
        provider="test",
        api_key="ak_test",
        base_url="https://backend.composio.dev",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
)
for _ in range(3):
    warnings.warn("unrelated notice", UserWarning)
    mcp.generate("u", "m")
"""


def test_generate_keeps_default_warning_deduplication():
    """Under Python's default filters, repeated calls neither repeat the SDK
    notice nor make an unrelated once-per-line warning show again."""
    result = subprocess.run(
        [sys.executable, "-c", _DEFAULT_FILTERS_SCRIPT],
        capture_output=True,
        text=True,
        check=True,
    )

    assert result.stderr.count("include_composio_helper_actions") == 1
    assert result.stderr.count("unrelated notice") == 1
