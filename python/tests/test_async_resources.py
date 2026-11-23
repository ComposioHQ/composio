"""Async boundaries in connection polling, session files, and realtime triggers."""

import asyncio
import json
import logging
import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from composio_client import ProjectAuth

from composio import exceptions
from composio.client._async import AsyncHttpClient
from composio.core.models._async_resources import (
    AsyncConnectionRequest,
    AsyncRemoteFile,
    AsyncToolkits,
    AsyncTriggers,
)
from composio.core.models.base import allow_tracking


@pytest.fixture(autouse=True)
def disable_tracking():
    token = allow_tracking.set(False)
    yield
    allow_tracking.reset(token)


def test_resource_uses_native_transport_and_project_identity():
    async def exercise():
        async def dispatch(request):
            assert request.url.path.endswith("/toolkits")
            assert request.headers["x-framework"] == "test-async"
            return httpx.Response(200, json={"items": [], "next_cursor": None})

        http = httpx.AsyncClient(transport=httpx.MockTransport(dispatch))
        async with AsyncHttpClient(
            provider="test-async", auth=ProjectAuth("unused"), http_client=http
        ) as client:
            assert await AsyncToolkits(client).get() == []

    asyncio.run(exercise())


def test_cancel_connection_wait_stops_polling(monkeypatch):
    async def exercise():
        sleeping = asyncio.Event()

        async def sleep_until_cancelled(delay):
            sleeping.set()
            await asyncio.Event().wait()

        monkeypatch.setattr(
            "composio.core.models._async_resources.connected_accounts.asyncio.sleep",
            sleep_until_cancelled,
        )
        client = Mock()
        client.connected_accounts.retrieve = AsyncMock(
            return_value=SimpleNamespace(status="INITIATED")
        )
        wait = AsyncConnectionRequest("ca_1", "INITIATED", None, client)
        task = asyncio.create_task(wait.wait_for_connection())
        await asyncio.wait_for(sleeping.wait(), timeout=1)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        client.connected_accounts.retrieve.assert_awaited_once_with(nanoid="ca_1")

    asyncio.run(exercise())


def test_connection_deadline_interrupts_http_client_retries():
    async def exercise():
        requests = []

        async def respond(request):
            requests.append(request)
            return httpx.Response(429, headers={"Retry-After": "10"}, json={})

        http = httpx.AsyncClient(transport=httpx.MockTransport(respond))
        async with AsyncHttpClient(
            provider="test", auth=ProjectAuth("unused"), http_client=http, max_retries=2
        ) as client:
            request = AsyncConnectionRequest("ca_1", "INITIATED", None, client)
            async with asyncio.timeout(2):
                with pytest.raises(exceptions.ComposioSDKTimeoutError, match="ca_1"):
                    await request.wait_for_connection(timeout=0.05)
            assert len(requests) == 1

    asyncio.run(exercise())


@pytest.mark.parametrize(
    "status,error",
    [
        ("EXPIRED", exceptions.SDKError),
        ("INITIATED", exceptions.ComposioSDKTimeoutError),
    ],
)
def test_connection_wait_fails_with_sync_error_types(status, error):
    async def exercise():
        client = Mock()
        client.connected_accounts.retrieve = AsyncMock(
            return_value=SimpleNamespace(status=status)
        )
        request = AsyncConnectionRequest("ca_1", "INITIATED", None, client)
        with pytest.raises(error):
            await request.wait_for_connection(timeout=0)
        assert request.status == status

    asyncio.run(exercise())


def test_async_file_reads_use_the_guarded_transfer_off_loop(monkeypatch):
    loop_thread = threading.get_ident()

    def fetch(url):
        assert url == "https://download.invalid/report"
        assert threading.get_ident() != loop_thread
        return b"document", "text/plain"

    monkeypatch.setattr(
        "composio.core.models.tool_router_session_files._fetch_url_bytes", fetch
    )
    file = AsyncRemoteFile(
        expires_at="",
        mount_relative_path="work/report.txt",
        sandbox_mount_prefix="/tmp",
        download_url="https://download.invalid/report",
    )
    assert file.filename == "report.txt"
    assert asyncio.run(file.text()) == "document"


def test_realtime_handler_runs_on_loop_and_can_stop_its_subscription(monkeypatch):
    async def exercise():
        loop = asyncio.get_running_loop()
        pusher = Mock()
        channel = Mock()
        callbacks = {}
        channel.bind.side_effect = lambda event_name, callback: callbacks.update(
            {event_name: callback}
        )
        pusher.subscribe.return_value = channel

        def bind(_, callback):
            pusher.connect.side_effect = lambda: callback("{}")

        pusher.connection.bind.side_effect = bind
        client = Mock()
        client._logger.logger = logging.getLogger("test-async-trigger")
        client.get = AsyncMock(
            return_value=SimpleNamespace(
                project_id="p1", pusher_cluster="eu", pusher_key="unused"
            )
        )
        monkeypatch.setattr(
            "composio.core.models._async_resources.subscription._new_realtime_pusher",
            lambda *args: pusher,
        )
        triggers = AsyncTriggers(client)
        subscription = await triggers.subscribe(timeout=1)
        received = asyncio.Event()

        @subscription.handle()
        async def observe(event):
            assert asyncio.get_running_loop() is loop
            assert event["trigger_slug"] == "composio.connected_account.expired"
            await subscription.stop()
            received.set()

        frame = {
            "id": "e",
            "type": "composio.connected_account.expired",
            "metadata": {},
            "data": {},
        }
        await asyncio.to_thread(callbacks["trigger_to_client"], json.dumps(frame))
        await asyncio.wait_for(received.wait(), timeout=1)
        await triggers.aclose()
        await triggers.aclose()
        pusher.disconnect.assert_called_once()
        assert not subscription.is_alive()

    asyncio.run(exercise())


def test_mcp_created_configuration_generates_user_url():
    from composio.core.models._async_resources import AsyncMCP

    async def exercise():
        async def respond(request):
            if request.url.path.endswith("/generate"):
                data = {"user_ids_url": ["https://example.invalid/mcp/user_1"]}
            else:
                data = {
                    "id": "mcp_1",
                    "name": "demo",
                    "commands": {},
                    "allowed_tools": [],
                    "auth_config_ids": [],
                    "mcp_url": "https://example.invalid/mcp",
                }
            return httpx.Response(200, json=data)

        http = httpx.AsyncClient(transport=httpx.MockTransport(respond))
        async with AsyncHttpClient(
            provider="async", auth=ProjectAuth("unused"), http_client=http
        ) as client:
            config = await AsyncMCP(client).create("demo", ["github"])
            user = await config.generate("user_1", manually_manage_connections=True)
            assert user["url"] == "https://example.invalid/mcp/user_1"
            assert user["id"] == "mcp_1"

    asyncio.run(exercise())


def test_closing_triggers_cancels_pending_subscription_credentials():
    async def exercise():
        entered = asyncio.Event()

        async def credentials(**kwargs):
            entered.set()
            await asyncio.Event().wait()

        client = Mock()
        client._logger.logger = logging.getLogger("test-async-trigger")
        client.get = credentials
        triggers = AsyncTriggers(client)
        connecting = asyncio.create_task(triggers.subscribe())
        await asyncio.wait_for(entered.wait(), timeout=1)
        await triggers.aclose()
        with pytest.raises(asyncio.CancelledError):
            await connecting
        with pytest.raises(RuntimeError, match="closed"):
            await triggers.subscribe()

    asyncio.run(exercise())
