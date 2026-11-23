"""Async SDK transport contracts at the generated client's HTTP boundary."""

import asyncio

import composio_client
import httpx
import pytest
from composio_client import ProjectAuth

from composio import api_error_details, exceptions
from composio.client._async import AsyncHttpClient

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def make_client(transport: httpx.AsyncClient) -> AsyncHttpClient:
    return AsyncHttpClient(
        provider="test-provider",
        auth=ProjectAuth("test-key"),
        base_url="https://backend.invalid",
        http_client=transport,
    )


async def test_concurrent_calls_use_their_own_request_context() -> None:
    requests = {}
    both_bound = asyncio.Barrier(2)

    def respond(request: httpx.Request) -> httpx.Response:
        requests[request.url.path] = request.headers["x-request-id"]
        return httpx.Response(200, json={})

    async with make_client(
        httpx.AsyncClient(transport=httpx.MockTransport(respond))
    ) as client:

        async def send(request_id: str, sender: AsyncHttpClient) -> None:
            token = client.request_ctx.set(
                {"id": request_id, "provider": "test-provider"}
            )
            try:
                await both_bound.wait()
                await sender.get(f"/{request_id}", cast_to=dict)
            finally:
                client.request_ctx.reset(token)

        await asyncio.gather(
            send("first", client), send("second", client.without_retries)
        )

    assert requests == {"/first": "first", "/second": "second"}


async def test_redirect_to_other_origin_omits_sdk_request_id() -> None:
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.host == "backend.invalid":
            return httpx.Response(
                302, headers={"location": "https://storage.invalid/file"}
            )
        return httpx.Response(200, json={})

    async with make_client(
        httpx.AsyncClient(transport=httpx.MockTransport(respond))
    ) as client:
        await client.get("/download", cast_to=dict)

    original, redirected = requests
    assert original.headers["x-request-id"]
    assert original.headers["x-framework"] == "test-provider"
    assert redirected.url.host == "storage.invalid"
    assert "x-request-id" not in redirected.headers
    assert "x-framework" not in redirected.headers


async def test_api_failure_retains_sdk_and_generated_error_contracts() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            403,
            json={
                "error": {
                    "message": "Access denied",
                    "code": 1403,
                    "slug": "FORBIDDEN",
                    "status": 403,
                    "request_id": "req_test",
                    "suggested_fix": "Check project access",
                }
            },
        )

    async with make_client(
        httpx.AsyncClient(transport=httpx.MockTransport(respond))
    ) as client:
        with pytest.raises(exceptions.ComposioError) as caught:
            await client.tools.list()

    error = caught.value
    assert isinstance(error, composio_client.PermissionDeniedError)
    assert error.status_code == 403
    assert error.request_id == "req_test"
    assert api_error_details(error).api_error_code == 1403
    assert api_error_details(error).suggested_fix == "Check project access"


async def test_retry_disabled_execution_uses_shared_transport_once() -> None:
    requests = []

    def timeout(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        raise httpx.ReadTimeout("timed out after dispatch", request=request)

    transport = httpx.AsyncClient(transport=httpx.MockTransport(timeout))
    async with make_client(transport) as client:
        sibling = client.without_retries
        assert client.max_retries > 0
        with pytest.raises(composio_client.APITimeoutError):
            await sibling.tools.execute("EXAMPLE_TOOL", arguments={})

    (request,) = requests
    assert request.method == "POST"
    assert request.headers["x-framework"] == "test-provider"
    assert transport.is_closed
    assert sibling.is_closed()


async def test_cancelled_request_exits_context_and_closes_transport() -> None:
    in_flight = asyncio.Event()
    cancelled = asyncio.Event()

    async def wait_for_cancellation(request: httpx.Request) -> httpx.Response:
        in_flight.set()
        try:
            await asyncio.Future()
        finally:
            cancelled.set()
        raise AssertionError("request should have been cancelled")

    transport = httpx.AsyncClient(transport=httpx.MockTransport(wait_for_cancellation))
    client = make_client(transport)

    async def request_with_context() -> None:
        async with client:
            await client.tools.list()

    async with asyncio.timeout(5):
        task = asyncio.create_task(request_with_context())
        try:
            await in_flight.wait()
        finally:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task

    assert cancelled.is_set()
    assert transport.is_closed
    await client.aclose()


async def test_tracking_preference_is_local_to_the_async_client(monkeypatch):
    from composio import AsyncComposio
    from composio.core.models import base

    events = []
    monkeypatch.setattr(base, "push_event", lambda *, event: events.append(event))
    async with AsyncComposio(api_key="test", allow_tracking=False) as quiet:
        async with AsyncComposio(api_key="test", allow_tracking=True) as tracked:
            quiet.tools.sanitize_payload({})
            assert not events
            tracked.tools.sanitize_payload({})
            assert len(events) == 1
        events.clear()
        quiet.tools.sanitize_payload({})
    assert events == []
