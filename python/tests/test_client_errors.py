"""HTTP status errors from the generated client must be ``ComposioError``s.

The generated client (``composio_client``) has its own exception root, so an
invalid API key or any other 4xx/5xx response used to escape
``except ComposioError`` (issue #4537). ``HttpClient`` now builds those errors
as subclasses of both the generated class and ``ComposioError``, so SDK callers
can catch one root while existing ``except APIStatusError`` handlers, including
the SDK's own, keep working.
"""

import copy
import pickle
import typing as t
from unittest.mock import Mock

import composio_client
import httpx
import pytest
from composio_client import ProjectAuth

from composio import exceptions
from composio.client import HttpClient
from composio.core.models.base import allow_tracking
from composio.core.models.tools import Tools
from composio.core.models.triggers import Triggers


@pytest.fixture(autouse=True)
def disable_telemetry():
    """Disable telemetry for all tests to prevent thread issues."""
    token = allow_tracking.set(False)
    yield
    allow_tracking.reset(token)


def _client_returning(
    status: int,
    *,
    max_retries: int = 0,
    calls: t.Optional[t.List[httpx.Request]] = None,
    body: t.Optional[object] = None,
) -> HttpClient:
    def handler(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(request)
        return httpx.Response(
            status,
            json=body if body is not None else {"error": {"message": "nope"}},
            # Keep retry backoff short in tests.
            headers={"retry-after-ms": "1"},
        )

    return HttpClient(
        provider="test",
        auth=ProjectAuth("sk-test"),
        base_url="https://backend.invalid",
        max_retries=max_retries,
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


def test_status_error_exposes_the_server_error_details() -> None:
    body = {
        "error": {
            "message": "toolkit GMAIL version 20250114_00 is retired and can no longer be executed",
            "code": 1410,
            "slug": "TOOLKIT_VERSION_RETIRED",
            "status": 410,
            "request_id": "req_body",
            "suggested_fix": "Pin 20261101_00",
        }
    }
    client = _client_returning(410, body=body)

    with pytest.raises(composio_client.APIStatusError) as exc_info:
        client.tools.execute(tool_slug="GMAIL_SEND_EMAIL", arguments={})

    error = exc_info.value
    assert error.status_code == 410
    assert error.api_error_code == 1410
    assert error.suggested_fix == "Pin 20261101_00"
    assert error.possible_fixes == ["Pin 20261101_00"]
    assert error.request_id == "req_body"
    assert "toolkit GMAIL version 20250114_00 is retired" in str(error)
    assert "{" not in str(error)


def test_possible_fixes_fall_back_to_the_status() -> None:
    body = {
        "error": {
            "message": "connected account belongs to another project",
            "code": 1403,
            "slug": "FORBIDDEN",
            "status": 403,
        }
    }
    client = _client_returning(403, body=body)

    with pytest.raises(composio_client.PermissionDeniedError) as exc_info:
        client.tools.execute(tool_slug="GMAIL_SEND_EMAIL", arguments={})

    error = exc_info.value
    assert error.api_error_code == 1403
    assert error.suggested_fix is None
    assert error.possible_fixes == [
        "Ensure your API key and the connected account are allowed to run this tool"
    ]


def test_possible_fixes_use_the_api_error_code_for_a_missing_account() -> None:
    body = {
        "error": {
            "message": "No connected account found",
            "code": 1803,
            "slug": "CONNECTED_ACCOUNT_NOT_FOUND",
            "status": 400,
        }
    }
    client = _client_returning(400, body=body)

    with pytest.raises(composio_client.BadRequestError) as exc_info:
        client.tools.execute(tool_slug="GMAIL_SEND_EMAIL", arguments={})

    assert exc_info.value.possible_fixes == [
        "Ensure the connected account exists and is active in your Composio dashboard"
    ]


def test_possible_fixes_do_not_blame_the_slug_for_a_rate_limit() -> None:
    body = {
        "error": {
            "message": "slow down",
            "code": 1429,
            "slug": "RATE_LIMITED",
            "status": 429,
        }
    }
    client = _client_returning(429, body=body)

    with pytest.raises(composio_client.RateLimitError) as exc_info:
        client.tools.execute(tool_slug="GMAIL_SEND_EMAIL", arguments={})

    assert exc_info.value.possible_fixes == [
        "Wait before retrying",
        "Reduce how many requests your organization sends per minute",
    ]


def test_status_error_without_the_envelope_has_no_api_details() -> None:
    client = _client_returning(400, body={"unexpected": True})

    with pytest.raises(composio_client.APIStatusError) as exc_info:
        client.tools.execute(tool_slug="GMAIL_SEND_EMAIL", arguments={})

    error = exc_info.value
    assert error.api_error_code is None
    assert error.suggested_fix is None
    assert error.possible_fixes == [
        "Ensure the tool slug is correct and the input arguments for the tool is valid"
    ]


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


def test_schema_fetch_auth_error_is_a_composio_error() -> None:
    tools = Tools(client=_client_returning(401), provider=Mock())

    with pytest.raises(composio_client.AuthenticationError) as exc_info:
        tools.get_raw_composio_tool_by_slug("SLACK_FETCH_CONVERSATION_HISTORY")

    assert isinstance(exc_info.value, exceptions.ComposioError)
    assert not isinstance(exc_info.value, exceptions.ToolNotFoundError)


def test_trigger_type_not_found_mapping_still_applies() -> None:
    triggers = Triggers(client=_client_returning(404))

    with pytest.raises(exceptions.TriggerTypeNotFound) as exc_info:
        triggers.create(slug="NONEXISTENT_TRIGGER", user_id="user")

    assert isinstance(exc_info.value.__cause__, composio_client.NotFoundError)


def test_without_retries_client_raises_composio_error() -> None:
    client = _client_returning(401)

    with pytest.raises(exceptions.ComposioError) as exc_info:
        client.without_retries.tools.retrieve(tool_slug="GITHUB_CREATE_AN_ISSUE")

    assert isinstance(exc_info.value, composio_client.AuthenticationError)


def test_error_after_exhausted_retries_is_composio_error() -> None:
    calls: t.List[httpx.Request] = []
    client = _client_returning(503, max_retries=2, calls=calls)

    with pytest.raises(exceptions.ComposioError) as exc_info:
        client.tools.retrieve(tool_slug="GITHUB_CREATE_AN_ISSUE")

    assert isinstance(exc_info.value, composio_client.InternalServerError)
    assert len(calls) == 3


@pytest.mark.parametrize(
    "clone",
    [lambda error: pickle.loads(pickle.dumps(error)), copy.deepcopy],
    ids=["pickle", "deepcopy"],
)
def test_status_errors_survive_serialization(
    clone: t.Callable[[BaseException], BaseException],
) -> None:
    client = _client_returning(401)
    with pytest.raises(exceptions.ComposioError) as exc_info:
        client.tools.retrieve(tool_slug="GITHUB_CREATE_AN_ISSUE")
    error = exc_info.value

    restored = clone(error)

    assert type(restored) is type(error)
    assert isinstance(restored, composio_client.AuthenticationError)
    assert isinstance(restored, exceptions.ComposioError)
    assert t.cast(composio_client.APIStatusError, restored).status_code == 401
    assert str(restored) == str(error)
