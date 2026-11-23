"""Deliver pysher frames to callbacks on the subscribing asyncio loop."""

from __future__ import annotations

import asyncio
import inspect
import json
import typing as t

from pysher import Pusher
from typing_extensions import Unpack

from composio.client._async import AsyncHttpClient
from composio.core.models.internal import (
    INTERNAL_SDK_REALTIME_CREDENTIALS_ENDPOINT,
    SDKRealtimeCredentialsResponse,
)
from composio.core.models.triggers import (
    TriggerEvent,
    TriggerEventFilters,
    _new_realtime_pusher,
    _silent_pysher_logger,
    _SubscriptionFrames,
)
from composio.exceptions import ComposioSDKTimeoutError

_Callback = t.Callable[[TriggerEvent], t.Awaitable[None] | None]
HandlerT = t.TypeVar("HandlerT", bound=_Callback)
SubscriptionErrorHandler = t.Callable[[dict[str, t.Any]], t.Awaitable[None] | None]


class AsyncTriggerSubscription(_SubscriptionFrames):
    """A realtime listener bound to the event loop that created it."""

    def __init__(
        self, client: AsyncHttpClient, on_error: SubscriptionErrorHandler | None
    ) -> None:
        super().__init__(logger=client._logger.logger)
        self._loop = asyncio.get_running_loop()
        self._client = client
        self._on_error = on_error
        self._callbacks: list[tuple[_Callback, TriggerEventFilters]] = []
        self._chunks = {}
        self._tasks: set[asyncio.Task[None]] = set()
        self._pusher: Pusher | None = None
        self._ready = asyncio.Event()
        self._connection_error: Exception | None = None
        self._closed = False
        self._closing: asyncio.Task[None] | None = None

    def handle(
        self, **filters: Unpack[TriggerEventFilters]
    ) -> t.Callable[[HandlerT], HandlerT]:
        """Register a callback and preserve its type when used as a decorator."""

        def register(callback: HandlerT) -> HandlerT:
            self._callbacks.append((callback, filters))
            return callback

        return register

    def _schedule(self, callback: t.Callable[..., None], *args: object) -> None:
        # Pysher invokes this on its websocket thread. All handler/task mutations
        # take place on the owning loop, including during reconnect or shutdown.
        if not self._closed and not self._loop.is_closed():
            self._loop.call_soon_threadsafe(callback, *args)

    def _start_callback(self, callback: t.Callable[..., t.Any], arg: object) -> None:
        if self._closed:
            return

        async def run() -> None:
            try:
                if inspect.iscoroutinefunction(callback):
                    await callback(arg)
                else:
                    result = await asyncio.to_thread(callback, arg)
                    if inspect.isawaitable(result):
                        await result
            except Exception as error:
                self.logger.error(f"Trigger callback failed: {error}")

        task = self._loop.create_task(run())
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    def _handle_event(self, event: str) -> None:
        data = self._parse_payload(event)
        if data is not None:
            for callback, filters in self._callbacks:
                if self._filters_match(
                    data, filters, getattr(callback, "__name__", "handler")
                ):
                    self._start_callback(callback, data)

    def _subscription_error(self, event: str) -> None:
        self.logger.error("Realtime subscription reported an error")
        if self._on_error is not None:
            try:
                payload = json.loads(event)
            except ValueError:
                payload = {"raw": event}
            self._start_callback(self._on_error, payload)

    def _failed(self, error: Exception) -> None:
        self._connection_error = error
        self._ready.set()
        self.logger.error(f"Realtime subscription failed: {error}")
        if self._on_error is not None:
            self._start_callback(self._on_error, {"error": str(error)})

    async def connect(self, timeout: float) -> None:
        credentials = await self._client.get(
            path=INTERNAL_SDK_REALTIME_CREDENTIALS_ENDPOINT,
            cast_to=SDKRealtimeCredentialsResponse,
        )
        if self._closed:
            raise RuntimeError("Trigger subscription closed during connection")
        pusher = _new_realtime_pusher(
            self._client, credentials.pusher_key, credentials.pusher_cluster
        )
        pusher.connection.logger = _silent_pysher_logger()

        def connected(_: str) -> None:
            # Pysher synchronously authenticates this channel on the websocket thread.
            try:
                channel = pusher.subscribe(
                    channel_name=f"private-{credentials.project_id}_triggers"
                )
                channel.bind(
                    event_name="trigger_to_client",
                    callback=lambda frame: self._schedule(self._handle_event, frame),
                )
                channel.bind(
                    event_name="chunked-trigger_to_client",
                    callback=lambda frame: self._schedule(
                        self._handle_chunked_events, frame
                    ),
                )
                channel.bind(
                    event_name="pusher:subscription_error",
                    callback=lambda frame: self._schedule(
                        self._subscription_error, frame
                    ),
                )
            except Exception as error:
                self._schedule(self._failed, error)
                return
            self._schedule(self._ready.set)

        pusher.connection.bind("pusher:connection_established", connected)
        pusher.connect()  # Starts the websocket thread.
        self._pusher = pusher
        try:
            async with asyncio.timeout(timeout):
                await self._ready.wait()
        except TimeoutError as error:
            raise ComposioSDKTimeoutError(
                "Timed out while waiting for trigger listener to be established"
            ) from error
        if self._connection_error is not None:
            raise self._connection_error
        if self._closed:
            raise RuntimeError("Trigger subscription closed during connection")

    def is_alive(self) -> bool:
        return (
            self._ready.is_set() and not self._closed and self._connection_error is None
        )

    def has_errored(self) -> bool:
        return self._pusher is None or not self._pusher.connection.is_alive()

    async def wait_forever(self) -> None:
        while self.is_alive() and not self.has_errored():
            await asyncio.sleep(0.5)

    async def restart(self) -> None:
        if self._pusher is None or self._closed:
            raise RuntimeError("Trigger subscription is closed")
        await asyncio.to_thread(self._pusher.connection.reconnect, reconnect_interval=0)

    async def stop(self) -> None:
        """Disconnect the websocket and cancel pending handler tasks."""
        if self._closing is None:
            self._closed = True
            self._ready.set()
            caller = asyncio.current_task()
            self._closing = self._loop.create_task(self._disconnect(caller))
        await asyncio.shield(self._closing)

    async def _disconnect(self, caller: asyncio.Task[t.Any] | None) -> None:
        handlers = self._tasks - {caller} if caller is not None else self._tasks.copy()
        for task in handlers:
            task.cancel()
        try:
            if self._pusher is not None:
                await asyncio.to_thread(self._pusher.disconnect)
        finally:
            await asyncio.gather(*handlers, return_exceptions=True)
            self._chunks.clear()
            self._callbacks.clear()
