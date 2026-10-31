"""Tool executions and proxied API calls must not retry.

A POST that times out while the backend is still processing it is unsafe to
retry: the request may already have taken effect, so a silent re-send can
duplicate the side effect (e.g. send an email twice). The backend does not
deduplicate executions, so every execution path (``tools.execute``,
``tools.proxy``, and the session ``execute`` / ``proxy_execute`` paths) routes
through ``client.without_retries`` (a retry-disabled clone), while reads keep
the default retry behaviour.

See https://github.com/ComposioHQ/composio/issues/3654.
The transport failure matrix also covers the SDK portion of issue #4953;
backend OAuth refresh and deduplication are outside this local harness.
"""

import inspect
import json
import typing as t
from unittest.mock import Mock, patch

import httpx
import pytest
from composio_client import (
    DEFAULT_MAX_RETRIES,
    APIConnectionError,
    APIError,
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    ProjectAuth,
)
from composio_client import Composio as BaseComposio

from composio.client import HttpClient
from composio.core.models.base import allow_tracking
from composio.core.models.session_context import SessionContextImpl
from composio.core.models.tool_router_session import ToolRouterSession
from composio.core.models.tools import Tools


@pytest.fixture(autouse=True)
def disable_telemetry():
    """Disable telemetry for all tests to prevent thread issues."""
    token = allow_tracking.set(False)
    yield
    allow_tracking.reset(token)


@pytest.fixture
def no_sleep(monkeypatch: pytest.MonkeyPatch) -> None:
    """Neutralise retry backoff so retry tests run instantly."""
    import composio_client._base_client as base

    monkeypatch.setattr(base.time, "sleep", lambda *args, **kwargs: None)


def _client_with_transport(
    handler: t.Callable[[httpx.Request], httpx.Response],
    max_retries: int = DEFAULT_MAX_RETRIES,
) -> HttpClient:
    """Build an ``HttpClient`` whose HTTP requests are served by ``handler``.

    ``base_url`` is passed explicitly so the test does not depend on
    ``COMPOSIO_BASE_URL`` possibly being set in the environment.
    """
    return HttpClient(
        provider="test",
        auth=ProjectAuth("sk-test"),
        base_url="https://backend.invalid",
        max_retries=max_retries,
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )


class TestCopyOverride:
    """Guards the ``HttpClient.with_options()`` override."""

    def test_with_options_does_not_raise_and_overrides_max_retries(self) -> None:
        client = HttpClient(
            provider="myprovider",
            auth=ProjectAuth("sk-test"),
            base_url="https://backend.invalid",
        )

        # Without the with_options() override this raises:
        # TypeError: missing required keyword-only argument 'provider'.
        clone = client.with_options(max_retries=0)

        assert isinstance(clone, HttpClient)
        assert clone.max_retries == 0
        assert clone.provider == "myprovider"
        assert clone.request_ctx.get()["provider"] == "myprovider"
        # The original client keeps its retries.
        assert client.max_retries == DEFAULT_MAX_RETRIES

    def test_without_retries_is_a_cached_zero_retry_sibling(self) -> None:
        client = HttpClient(
            provider="test",
            auth=ProjectAuth("sk-test"),
            base_url="https://backend.invalid",
        )

        assert client.without_retries.max_retries == 0
        # Cached: repeated access returns the same instance (no per-call clone).
        assert client.without_retries is client.without_retries
        # Reads on the original client keep retrying.
        assert client.max_retries == DEFAULT_MAX_RETRIES

    def test_clone_preserves_strict_response_validation(self) -> None:
        # The sibling must differ from the parent only in retries, including
        # `_strict_response_validation`, which the generated `copy` carries.
        client = HttpClient(
            provider="test",
            auth=ProjectAuth("sk-test"),
            base_url="https://backend.invalid",
            _strict_response_validation=True,
        )

        assert client.without_retries._strict_response_validation is True


class TestBaseWithOptionsContract:
    """Pin the generated-client internals the ``with_options()`` override depends on.

    These guard the contract so a ``composio_client`` regen that breaks it fails
    as an obvious assertion here rather than a cryptic ``TypeError`` raised deep
    inside ``with_options`` at runtime.
    """

    def test_base_with_options_accepts_extra_kwargs(self) -> None:
        # The override threads `provider` (and the SDK logger) through
        # `_extra_kwargs`; the base `with_options` must still accept it.
        # Read through `__dict__`: up to rc.19 `with_options` is a class-level
        # alias of `copy`, which mypy will not let a generic class expose.
        base_with_options = BaseComposio.__dict__["with_options"]
        assert "_extra_kwargs" in inspect.signature(base_with_options).parameters

    def test_with_options_is_overridden(self) -> None:
        assert "with_options" in HttpClient.__dict__


def _direct_tool(client: HttpClient) -> t.Any:
    tools = Tools(client=client, provider=Mock())
    mock_tool = Mock()
    mock_tool.toolkit.slug = "gmail"
    # Keep the read-only schema lookup outside the execution transport.
    with patch.object(tools, "get_raw_composio_tool_by_slug", return_value=mock_tool):
        return tools._execute_tool(
            slug="GMAIL_SEND_EMAIL",
            arguments={"to": "test@test.com"},
            tool=mock_tool,
            version="1.0.0",
        )


SESSION_ID = "sess_123"


def _session(client: HttpClient) -> ToolRouterSession:
    return ToolRouterSession(
        client=client,
        provider=None,
        dangerously_allow_auto_upload_download_files=False,
        session_id=SESSION_ID,
        mcp=Mock(),
        experimental=Mock(),
    )


def _provider_wrapped_session_tool(client: HttpClient) -> t.Any:
    tools = Tools(client=client, provider=Mock())
    # Avoid the (read) tool-schema lookup hitting the transport.
    mock_tool = Mock()
    mock_tool.toolkit.slug = "gmail"
    mock_tool.input_parameters = {}
    tools._tool_schemas["GMAIL_SEND_EMAIL"] = mock_tool
    execute = tools._wrap_execute_tool_for_tool_router(session_id=SESSION_ID)
    return execute("GMAIL_SEND_EMAIL", {"to": "test@test.com"})


PROXY_KWARGS: t.Dict[str, t.Any] = {
    "toolkit": "github",
    "endpoint": "https://api.github.com/user/repos",
    "method": "POST",
    "body": {"name": "repo"},
}

EXECUTION_PATHS: t.List[t.Tuple[str, t.Callable[[HttpClient], t.Any]]] = [
    ("direct_tool", _direct_tool),
    (
        "direct_proxy",
        lambda client: Tools(client=client, provider=Mock()).proxy(
            endpoint="/any", method="POST", body={"name": "repo"}
        ),
    ),
    ("provider_wrapped_session_tool", _provider_wrapped_session_tool),
    (
        "session_execute",
        lambda client: _session(client).execute(
            "GMAIL_SEND_EMAIL", arguments={"to": "test@test.com"}
        ),
    ),
    (
        "session_proxy_execute",
        lambda client: _session(client).proxy_execute(**PROXY_KWARGS),
    ),
    (
        "custom_tool_context_execute",
        lambda client: SessionContextImpl(client, "test-user", SESSION_ID).execute(
            "GMAIL_SEND_EMAIL", {"to": "test@test.com"}
        ),
    ),
    (
        "custom_tool_context_proxy_execute",
        lambda client: SessionContextImpl(
            client, "test-user", SESSION_ID
        ).proxy_execute(**PROXY_KWARGS),
    ),
]


Failure = t.Union[int, t.Type[httpx.TransportError]]
TRANSIENT_FAILURES = [
    pytest.param(status, APIStatusError, id=f"http-{status}")
    for status in (408, 409, 429, 500, 502, 503, 504)
] + [
    pytest.param(httpx.ConnectTimeout, APITimeoutError, id="connect-timeout"),
    pytest.param(httpx.ReadTimeout, APITimeoutError, id="read-timeout"),
    pytest.param(httpx.ConnectError, APIConnectionError, id="connect-error"),
    pytest.param(httpx.RemoteProtocolError, APIConnectionError, id="connection-reset"),
]


def _fail_request(request: httpx.Request, failure: Failure) -> httpx.Response:
    if isinstance(failure, int):
        return httpx.Response(failure, json={"error": {"message": "transient"}})
    raise failure("simulated transport failure", request=request)


class TestExecutionDoesNotRetry:
    """All execution paths fail once, even if a side effect already happened."""

    @pytest.mark.parametrize(
        "run",
        [run for _, run in EXECUTION_PATHS],
        ids=[name for name, _ in EXECUTION_PATHS],
    )
    @pytest.mark.parametrize("failure, error_type", TRANSIENT_FAILURES)
    def test_does_not_retry_on_transient_error(
        self,
        run: t.Callable[[HttpClient], t.Any],
        failure: Failure,
        error_type: t.Type[APIError],
        no_sleep: None,
    ) -> None:
        attempts: t.List[httpx.Request] = []
        side_effects: t.List[t.Dict[str, t.Any]] = []

        def handler(request: httpx.Request) -> httpx.Response:
            attempts.append(request)
            if failure is httpx.ReadTimeout:
                # The simulated backend commits the write before its response
                # is lost. A retry would create a second external object.
                side_effects.append(json.loads(request.content))
            return _fail_request(request, failure)

        client = _client_with_transport(handler)
        with client:
            with pytest.raises(error_type) as caught:
                run(client)

        assert len(attempts) == 1
        assert attempts[0].method == "POST"
        if failure is httpx.ReadTimeout:
            assert len(side_effects) == 1
            assert side_effects[0]
        if isinstance(failure, int):
            assert isinstance(caught.value, APIStatusError)
            assert caught.value.status_code == failure
        else:
            assert isinstance(caught.value.__cause__, failure)

    @pytest.mark.parametrize(
        "run",
        [run for _, run in EXECUTION_PATHS],
        ids=[name for name, _ in EXECUTION_PATHS],
    )
    def test_expired_token_error_is_not_replayed(
        self,
        run: t.Callable[[HttpClient], t.Any],
        no_sleep: None,
    ) -> None:
        """A backend auth failure is surfaced, not silently replayed by the SDK."""
        attempts: t.List[httpx.Request] = []
        body = {"error": {"message": "token expired", "code": "token_expired"}}

        def handler(request: httpx.Request) -> httpx.Response:
            attempts.append(request)
            return httpx.Response(401, json=body)

        client = _client_with_transport(handler)
        with client:
            with pytest.raises(AuthenticationError) as caught:
                run(client)

        assert len(attempts) == 1
        assert caught.value.status_code == 401
        assert caught.value.body == body


class TestReadPathStillRetries:
    """Reads keep the default retry behaviour — only writes are scoped to no-retry."""

    @pytest.mark.parametrize(
        "failure",
        [case.values[0] for case in TRANSIENT_FAILURES],
        ids=[case.id for case in TRANSIENT_FAILURES],
    )
    def test_read_retries_then_succeeds(
        self,
        failure: Failure,
        no_sleep: None,
    ) -> None:
        attempts: t.List[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            attempts.append(request)
            if len(attempts) == 1:
                return _fail_request(request, failure)
            return httpx.Response(
                200,
                json={
                    "current_page": 1,
                    "items": [],
                    "total_items": 0,
                    "total_pages": 1,
                },
            )

        client = _client_with_transport(handler)
        with client:
            result = client.tools.list()

        assert len(attempts) == 2
        assert all(request.method == "GET" for request in attempts)
        assert attempts[0].url == attempts[1].url
        assert result.total_items == 0

    @pytest.mark.parametrize("max_retries", [0, 1, 3])
    @pytest.mark.parametrize(
        "failure, error_type",
        [
            pytest.param(503, APIStatusError, id="http-503"),
            pytest.param(httpx.ReadTimeout, APITimeoutError, id="read-timeout"),
        ],
    )
    def test_read_stops_at_retry_budget(
        self,
        failure: Failure,
        error_type: t.Type[APIError],
        max_retries: int,
        no_sleep: None,
    ) -> None:
        attempts: t.List[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            attempts.append(request)
            return _fail_request(request, failure)

        client = _client_with_transport(handler, max_retries=max_retries)
        with client:
            with pytest.raises(error_type):
                client.tools.list()

        assert len(attempts) == max_retries + 1
        assert all(request.method == "GET" for request in attempts)
