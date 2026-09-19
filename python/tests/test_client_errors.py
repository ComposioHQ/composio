"""HTTP status errors from the generated client must be ``ComposioError``s.

The generated client (``composio_client``) has its own exception root, so an
invalid API key or any other 4xx/5xx response used to escape
``except ComposioError`` (issue #4537). ``HttpClient`` now builds those errors
as subclasses of both the generated class and ``ComposioError``, so SDK callers
can catch one root while existing ``except APIStatusError`` handlers, including
the SDK's own, keep working.
"""

import typing as t
from unittest.mock import Mock

import composio_client
import httpx
import pytest

from composio import exceptions
from composio.client import HttpClient
from composio.core.models.base import allow_tracking
from composio.core.models.tools import Tools


@pytest.fixture(autouse=True)
def disable_telemetry():
    """Disable telemetry for all tests to prevent thread issues."""
    token = allow_tracking.set(False)
    yield
    allow_tracking.reset(token)


def _client_returning(status: int) -> HttpClient:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"error": {"message": "nope"}})

    return HttpClient(
        provider="test",
        api_key="sk-test",
        base_url="https://backend.invalid",
        max_retries=0,
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )


@pytest.mark.parametrize(
    ("status", "client_error"),
    [
        (400, composio_client.BadRequestError),
        (401, composio_client.AuthenticationError),
        (403, composio_client.PermissionDeniedError),
        (404, composio_client.NotFoundError),
        (409, composio_client.ConflictError),
        (422, composio_client.UnprocessableEntityError),
        (429, composio_client.RateLimitError),
        (500, composio_client.InternalServerError),
        (418, composio_client.APIStatusError),
    ],
)
def test_status_errors_are_composio_errors(
    status: int, client_error: t.Type[composio_client.APIStatusError]
) -> None:
    client = _client_returning(status)

    with pytest.raises(exceptions.ComposioError) as exc_info:
        client.tools.retrieve(tool_slug="GITHUB_CREATE_AN_ISSUE")

    error = exc_info.value
    assert isinstance(error, client_error)
    assert isinstance(error, composio_client.APIStatusError)
    assert error.status_code == status
    assert error.message


def test_invalid_api_key_is_catchable_as_composio_error() -> None:
    client = _client_returning(401)

    try:
        client.tools.retrieve(tool_slug="GITHUB_CREATE_AN_ISSUE")
    except exceptions.ComposioError as error:
        assert isinstance(error, composio_client.AuthenticationError)
    else:
        pytest.fail("expected the 401 to raise")


def test_error_classes_are_reused_across_requests() -> None:
    client = _client_returning(401)
    raised = []
    for _ in range(2):
        with pytest.raises(composio_client.AuthenticationError) as exc_info:
            client.tools.retrieve(tool_slug="GITHUB_CREATE_AN_ISSUE")
        raised.append(type(exc_info.value))

    assert raised[0] is raised[1]
    assert raised[0].__name__ == "AuthenticationError"


def test_tool_not_found_mapping_still_applies() -> None:
    tools = Tools(client=_client_returning(404), provider=Mock())

    with pytest.raises(exceptions.ToolNotFoundError) as exc_info:
        tools.get_raw_composio_tool_by_slug("NONEXISTENT_TOOL")

    assert isinstance(exc_info.value.__cause__, composio_client.NotFoundError)


def test_schema_fetch_auth_error_is_a_composio_error() -> None:
    tools = Tools(client=_client_returning(401), provider=Mock())

    with pytest.raises(composio_client.AuthenticationError) as exc_info:
        tools.get_raw_composio_tool_by_slug("SLACK_FETCH_CONVERSATION_HISTORY")

    assert isinstance(exc_info.value, exceptions.ComposioError)
    assert not isinstance(exc_info.value, exceptions.ToolNotFoundError)
