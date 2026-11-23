"""Execution capability negotiation at the user-facing discovery boundary."""

import asyncio
import threading
from collections.abc import Callable
from typing import Any

import httpx
import pytest

from composio import AsyncComposio
from composio.core.provider._async import (
    AsyncToolCallback,
    require_async_tool_execution,
)
from composio.core.provider.agentic import AgenticProvider
from composio.exceptions import ValidationError


class UndeclaredProvider(AgenticProvider[object, list[object]], name="undeclared"):
    pass


def test_unsupported_adapter_fails_before_discovery():
    async def exercise():
        calls = []

        def respond(request):
            calls.append(request.method)
            assert request.method == "POST"
            return httpx.Response(
                201,
                json={
                    "session_id": "sess_1",
                    "mcp": {"type": "http", "url": "https://example.invalid/mcp"},
                    "config_version": 1,
                    "config": {
                        "user_id": "u",
                        "execute": {},
                        "search": {},
                        "preload": {"tools": []},
                    },
                },
            )

        http = httpx.AsyncClient(transport=httpx.MockTransport(respond))
        async with AsyncComposio(
            api_key="unused",
            provider=UndeclaredProvider(),
            allow_tracking=False,
            http_client=http,
        ) as client:
            with pytest.raises(
                ValidationError, match="UndeclaredProvider.*AsyncComposio"
            ):
                await client.tools.get("u", tools=["X"])
            assert calls == []
            session = await client.create(user_id="u")
            with pytest.raises(ValidationError, match="worker_thread"):
                await session.tools()
            assert calls == ["POST"]

    asyncio.run(exercise())


@pytest.mark.parametrize("wrapper", ["wrap_tool", "wrap_tools"])
def test_capability_is_inherited_only_with_unchanged_wrappers(wrapper):
    class Native(UndeclaredProvider, name="native"):
        async_tool_execution = "native"

    class Derived(Native, name="derived"):
        pass

    class Custom(Derived, name="custom"):
        pass

    require_async_tool_execution(Custom())
    setattr(Custom, wrapper, lambda self, *args: None)
    with pytest.raises(ValidationError, match="Custom"):
        require_async_tool_execution(Custom())

    class Declared(Custom, name="declared"):
        async_tool_execution = "worker_thread"

    require_async_tool_execution(Declared())


def test_worker_provider_runs_the_callback_on_its_owning_loop():
    class WorkerProvider(UndeclaredProvider, name="worker"):
        async_tool_execution = "worker_thread"

        async def invoke(self, callback: Callable[[str], Any]):
            return await asyncio.to_thread(callback, "test")

    async def exercise():
        loop = asyncio.get_running_loop()
        provider = WorkerProvider()
        require_async_tool_execution(provider)

        async def execute(slug):
            assert asyncio.get_running_loop() is loop
            return slug

        callback = AsyncToolCallback(execute)
        assert await provider.invoke(callback) == "test"
        with pytest.raises(RuntimeError, match="worker thread"):
            callback("test")

    asyncio.run(exercise())


def test_worker_event_loop_awaits_callback_on_owner_and_forwards_cancellation():
    async def exercise():
        owner = asyncio.get_running_loop()
        started = threading.Event()
        cancelled = asyncio.Event()

        async def execute(wait):
            assert asyncio.get_running_loop() is owner
            if wait:
                started.set()
                try:
                    await asyncio.Event().wait()
                finally:
                    cancelled.set()
            return "done"

        callback = AsyncToolCallback(execute)

        async def invoke_from_worker():
            assert await callback.aexecute(False) == "done"
            pending = asyncio.create_task(callback.aexecute(True))
            assert await asyncio.to_thread(started.wait, 2)
            pending.cancel()
            with pytest.raises(asyncio.CancelledError):
                await pending

        async with asyncio.timeout(5):
            await asyncio.to_thread(asyncio.run, invoke_from_worker())
            await cancelled.wait()

    asyncio.run(exercise())


def test_async_callback_reports_closed_owner_loop():
    async def create_callback():
        return AsyncToolCallback(asyncio.sleep)

    callback = asyncio.run(create_callback())
    with pytest.raises(RuntimeError, match="no longer running"):
        asyncio.run(callback.aexecute(0))
