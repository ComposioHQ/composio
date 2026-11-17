"""Error mapping for ``Tools.get_raw_composio_tool_by_slug``.

Only an unknown slug becomes ``ToolNotFoundError``. Other client failures,
such as an invalid API key, must surface unchanged so callers can tell a
missing tool from a rejected request (parity with the TypeScript SDK).
"""

from unittest.mock import Mock

import httpx
import pytest
from composio_client import AuthenticationError, BadRequestError, NotFoundError

from composio import exceptions
from composio.core.models.tools import Tools
from tests.conftest import mock_http_client


def _status_error(cls, status: int):
    request = httpx.Request("GET", "https://backend.composio.dev/api/v3/tools/X")
    response = httpx.Response(status, request=request)
    return cls("error", response=response, body=None)


@pytest.fixture
def mock_client() -> Mock:
    return mock_http_client()


@pytest.fixture
def tools(mock_client: Mock) -> Tools:
    return Tools(client=mock_client, provider=Mock())


def test_unknown_slug_raises_tool_not_found(tools: Tools, mock_client: Mock) -> None:
    not_found = _status_error(NotFoundError, 404)
    mock_client.tools.retrieve.side_effect = not_found

    with pytest.raises(exceptions.ToolNotFoundError) as exc_info:
        tools.get_raw_composio_tool_by_slug("NONEXISTENT_TOOL")

    assert exc_info.value.__cause__ is not_found
    assert isinstance(exc_info.value, exceptions.NotFoundError)
    assert "NONEXISTENT_TOOL" in str(exc_info.value)


def test_malformed_slug_raises_tool_not_found(tools: Tools, mock_client: Mock) -> None:
    mock_client.tools.retrieve.side_effect = _status_error(BadRequestError, 400)

    with pytest.raises(exceptions.ToolNotFoundError):
        tools.get_raw_composio_tool_by_slug("malformed slug")


def test_not_found_strips_control_characters(tools: Tools, mock_client: Mock) -> None:
    request = httpx.Request("GET", "https://backend.composio.dev/api/v3/tools/X")
    response = httpx.Response(404, request=request)
    mock_client.tools.retrieve.side_effect = NotFoundError(
        "error",
        response=response,
        body={
            "error": {
                "message": "missing\x1b[31m\n[!] run: evil",
                "code": 1404,
                "slug": "TOOL_NOT_FOUND",
                "status": 404,
            }
        },
    )

    with pytest.raises(exceptions.ToolNotFoundError) as exc_info:
        tools.get_raw_composio_tool_by_slug("GMAIL_SEND_EMAIL")

    assert str(exc_info.value) == (
        "Tool with slug GMAIL_SEND_EMAIL not found: missing [!] run: evil"
    )


def test_not_found_includes_the_server_message(tools: Tools, mock_client: Mock) -> None:
    request = httpx.Request("GET", "https://backend.composio.dev/api/v3/tools/X")
    response = httpx.Response(404, request=request)
    not_found = NotFoundError(
        "error",
        response=response,
        body={
            "error": {
                "message": "No tool with that slug in the pinned version",
                "code": 1404,
                "slug": "TOOL_NOT_FOUND",
                "status": 404,
                "suggested_fix": "Use the latest version",
            }
        },
    )
    mock_client.tools.retrieve.side_effect = not_found

    with pytest.raises(exceptions.ToolNotFoundError) as exc_info:
        tools.get_raw_composio_tool_by_slug("GMAIL_SEND_EMAIL")

    assert str(exc_info.value) == (
        "Tool with slug GMAIL_SEND_EMAIL not found: "
        "No tool with that slug in the pinned version"
    )
    assert exc_info.value.__cause__ is not_found


def test_invalid_api_key_is_not_tool_not_found(tools: Tools, mock_client: Mock) -> None:
    unauthorized = _status_error(AuthenticationError, 401)
    mock_client.tools.retrieve.side_effect = unauthorized

    with pytest.raises(AuthenticationError) as exc_info:
        tools.get_raw_composio_tool_by_slug("SLACK_FETCH_CONVERSATION_HISTORY")

    assert exc_info.value is unauthorized
    assert exc_info.value.status_code == 401


def test_execute_surfaces_auth_error_from_schema_fetch(
    tools: Tools, mock_client: Mock
) -> None:
    mock_client.tools.retrieve.side_effect = _status_error(AuthenticationError, 401)

    with pytest.raises(AuthenticationError):
        tools.execute("SLACK_FETCH_CONVERSATION_HISTORY", {}, user_id="user")

    mock_client.tools.execute.assert_not_called()
