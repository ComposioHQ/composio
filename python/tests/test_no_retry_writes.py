"""Non-idempotent tool writes (``tools.execute`` / ``tools.proxy``) must not retry.

A POST that times out while the backend is still processing it is unsafe to
retry: the request may already have taken effect, so a silent re-send can
duplicate the side effect (e.g. send an email twice). ``Tools.execute`` and
``Tools.proxy`` therefore route through ``client.without_retries`` (a
retry-disabled clone), while reads keep the default retry behaviour.
"""

import inspect
import typing as t
from unittest.mock import Mock, patch

import httpx
import pytest
from composio_client import DEFAULT_MAX_RETRIES, APIError
from composio_client import Composio as BaseComposio

from composio.client import HttpClient
from composio.core.models.base import allow_tracking
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
) -> HttpClient:
    """Build an ``HttpClient`` whose HTTP requests are served by ``handler``.

    ``base_url`` is passed explicitly so the test does not depend on
    ``COMPOSIO_BASE_URL`` possibly being set in the environment.
    """
    return HttpClient(
        provider="test",
        api_key="sk-test",
        base_url="https://backend.invalid",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )


class TestCopyOverride:
    """Guards the ``HttpClient.copy()`` override that makes ``with_options`` work."""

    def test_with_options_does_not_raise_and_overrides_max_retries(self) -> None:
        client = HttpClient(
            provider="myprovider",
            api_key="sk-test",
            base_url="https://backend.invalid",
        )

        # Without the copy() override this raises:
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
            api_key="sk-test",
            base_url="https://backend.invalid",
        )

        assert client.without_retries.max_retries == 0
        # Cached: repeated access returns the same instance (no per-call clone).
        assert client.without_retries is client.without_retries
        # Reads on the original client keep retrying.
        assert client.max_retries == DEFAULT_MAX_RETRIES

    def test_clone_preserves_strict_response_validation(self) -> None:
        # The generated `copy` drops `_strict_response_validation`; the override
        # re-injects it so the sibling differs from the parent only in retries.
        client = HttpClient(
            provider="test",
            api_key="sk-test",
            base_url="https://backend.invalid",
            _strict_response_validation=True,
        )

        assert client.without_retries._strict_response_validation is True


class TestStainlessCopyContract:
    """Pin the generated-client internals the ``copy()`` override depends on.

    These guard the contract so a ``composio_client`` regen that breaks it fails
    as an obvious assertion here rather than a cryptic ``TypeError`` raised deep
    inside ``with_options`` at runtime.
    """

    def test_base_copy_accepts_extra_kwargs(self) -> None:
        # The override threads `provider` (and `_strict_response_validation`)
        # through `_extra_kwargs`; the base `copy` must still accept it.
        assert "_extra_kwargs" in inspect.signature(BaseComposio.copy).parameters

    def test_with_options_is_aliased_to_our_copy_override(self) -> None:
        # The base binds `with_options = copy` at class-definition time, so the
        # subclass must re-alias it to the override that re-injects `provider`.
        # (Accessing these bound methods via the generic class trips mypy's
        # "generic instance variable via class" check; the identity assert is
        # intentional.)
        assert HttpClient.__dict__["with_options"] is HttpClient.__dict__["copy"]  # type: ignore[misc]


class TestWritePathDoesNotRetry:
    """``execute`` / ``proxy`` must reach the transport exactly once."""

    def test_execute_does_not_retry_on_transient_error(self, no_sleep: None) -> None:
        attempts: t.List[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            attempts.append(request)
            return httpx.Response(500, json={"error": {"message": "boom"}})

        client = _client_with_transport(handler)
        tools = Tools(client=client, provider=Mock())

        # Avoid the (read) tool-schema lookup hitting the transport.
        mock_tool = Mock()
        mock_tool.toolkit.slug = "gmail"
        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=mock_tool
        ):
            with pytest.raises(APIError):
                tools._execute_tool(
                    slug="GMAIL_SEND_EMAIL",
                    arguments={},
                    version="1.0.0",
                )

        assert len(attempts) == 1

    def test_proxy_does_not_retry_on_transient_error(self, no_sleep: None) -> None:
        attempts: t.List[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            attempts.append(request)
            return httpx.Response(500, json={"error": {"message": "boom"}})

        client = _client_with_transport(handler)
        tools = Tools(client=client, provider=Mock())

        # `proxy` does no tool-schema lookup, so the only transport hit is the
        # write itself — no read to patch out (unlike the execute test above).
        with pytest.raises(APIError):
            tools.proxy(endpoint="/any", method="POST")

        assert len(attempts) == 1


class TestReadPathStillRetries:
    """Reads keep the default retry behaviour — only writes are scoped to no-retry."""

    def test_read_retries_then_succeeds(self, no_sleep: None) -> None:
        attempts: t.List[httpx.Request] = []
        responses = [
            httpx.Response(503, json={"error": {"message": "transient"}}),
            httpx.Response(
                200,
                json={
                    "current_page": 1,
                    "items": [],
                    "total_items": 0,
                    "total_pages": 1,
                },
            ),
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            attempts.append(request)
            return responses[len(attempts) - 1]

        client = _client_with_transport(handler)

        result = client.tools.list()

        # First attempt 503, retried, second attempt 200 -> success.
        assert len(attempts) == 2
        assert result.total_items == 0
