from __future__ import annotations

import functools
import json
import time
import traceback
import typing as t
import uuid
from concurrent.futures import ThreadPoolExecutor
from unittest import mock

import typing_extensions as te
from pysher import Pusher
from pysher.channel import Channel as PusherChannel
from pysher.connection import Connection as PusherConnection

from composio import exceptions
from composio.client import HttpClient
from composio.client.types import trigger_instance_upsert_response
from composio.constants import PUSHER_CLUSTER, PUSHER_KEY
from composio.core.models.base import Resource
from composio.core.models.internal import Internal
from composio.exceptions import ComposioSDKTimeoutError
from composio.utils.logging import WithLogger

PUSHER_AUTH_URL = "{base_url}/api/v3/internal/sdk/realtime/auth?fromPython=true"


class TriggerConnectedAccountSchema(t.TypedDict):
    id: str
    uuid: str
    user_id: str
    auth_config_id: str
    auth_config_uuid: str
    status: t.Literal["ACTIVE", "INACTIVE"]


class TriggerMetadataSchema(t.TypedDict):
    id: str
    toolkit_slug: str
    trigger_slug: str
    trigger_data: t.Optional[str]
    trigger_config: t.Dict[str, t.Any]
    connected_account: TriggerConnectedAccountSchema


class TriggerEventData(t.TypedDict):
    id: str  # The ID of the trigger

    trigger_slug: str  # The slug of the trigger that triggered the event
    user_id: str  # The ID of the user that triggered the event
    toolkit_slug: str  # The slug of the toolkit that triggered the event

    metadata: TriggerMetadataSchema
    payload: t.Optional[t.Dict[str, t.Any]]  # The payload of the trigger
    original_payload: t.Optional[
        t.Dict[str, t.Any]
    ]  # The original payload of the trigger


class _ChunkedTriggerEventData(te.TypedDict):
    """Cunked trigger event data model."""

    id: str
    index: int
    chunk: str
    final: bool


class TriggerEventFilters(te.TypedDict):
    """Trigger event filterset."""

    trigger_slug: te.NotRequired[str]
    trigger_id: te.NotRequired[str]
    toolkit: te.NotRequired[str]
    user_id: te.NotRequired[str]
    auth_config_id: te.NotRequired[str]
    connected_account_id: te.NotRequired[str]


TriggerCallback = t.Callable[[TriggerEventData], None]


class TriggerSubscription(Resource):
    """Trigger subscription."""

    _pusher: Pusher
    _channel: PusherChannel
    _connection: PusherConnection
    _alive: bool

    def __init__(self, client: HttpClient) -> None:
        """Initialize subscription object."""
        super().__init__(client=client)
        self.client = client
        self._alive = False
        self._chunks: t.Dict[str, t.Dict[int, str]] = {}
        self._callbacks: t.List[t.Tuple[TriggerCallback, TriggerEventFilters]] = []

    def handle(
        self, **filters: te.Unpack[TriggerEventFilters]
    ) -> t.Callable[[TriggerCallback], TriggerCallback]:
        """Register a trigger callaback."""

        def _wrap(f: TriggerCallback) -> TriggerCallback:
            self.logger.debug(f"Registering callback `{f.__name__}`")
            self._callbacks.append((f, filters))
            return f

        return _wrap

    def _parse_payload(self, event: str) -> t.Optional[TriggerEventData]:
        """Parse event payload."""
        try:
            return TriggerEventData(**json.loads(event))  # type: ignore
        except Exception as e:
            self.logger.warning(f"Error decoding payload: {e}")
            return None

    def _handle_chunked_events(self, event: str) -> None:
        """Handle chunked events."""
        data = _ChunkedTriggerEventData(**json.loads(event))  # type: ignore
        if data["id"] not in self._chunks:
            self._chunks[data["id"]] = {}

        self._chunks[data["id"]][data["index"]] = data["chunk"]
        if data["final"]:
            _chunks = self._chunks.pop(data["id"])
            self._handle_event(event="".join([_chunks[idx] for idx in sorted(_chunks)]))

    def _filters_match(
        self,
        data: TriggerEventData,
        filters: TriggerEventFilters,
        callback: str,
    ) -> bool:
        """Check if filters match the event data."""
        checks = (
            ("trigger_slug", data["trigger_slug"]),
            ("trigger_id", data["metadata"]["id"]),
            ("toolkit", data["toolkit_slug"]),
            ("user_id", data["user_id"]),
            ("auth_config_id", data["metadata"]["connected_account"]["auth_config_id"]),
            ("connected_account_id", data["metadata"]["connected_account"]["id"]),
        )
        for name, check in checks:
            value = filters.get(name)
            if value is None or str(value).lower() == check.lower():
                continue

            self.logger.debug(
                f"Skipping `{callback}` since "
                f"`{name}` filter does not match the event metadata",
            )
            return False
        return True

    def _handle_callback(
        self,
        callback: TriggerCallback,
        data: TriggerEventData,
        filters: TriggerEventFilters,
    ) -> t.Any:
        """Handle callback."""
        if not self._filters_match(data, filters, callback.__name__):
            return

        try:
            callback(data)
        except Exception:
            self.logger.error(
                f"Error executing `{callback.__name__}` for "
                f"event `{data['metadata']['trigger_slug']}` "
                f"with error:\n {traceback.format_exc()}"
            )

    def _handle_event(self, event: str) -> None:
        """Filter events and call the callback function."""
        data = self._parse_payload(event=event)
        if data is None:
            self.logger.error(f"Error parsing trigger payload: {event}")
            return

        self.logger.debug(
            f"Received trigger event with trigger ID: {data['metadata']['id']} "
            f"and trigger name: {data['metadata']['trigger_slug']}"
        )
        awaitables: t.List = []
        with ThreadPoolExecutor() as executor:
            for callback, filters in self._callbacks:
                awaitables.append(
                    executor.submit(
                        self._handle_callback,
                        callback,
                        data,
                        filters,
                    )
                )
        _ = [future.result() for future in awaitables]

    def is_alive(self) -> bool:
        """Check if subscription is live."""
        return self._alive

    def has_errored(self) -> bool:
        """Check if the connection errored and disconnected."""
        return self._connection.socket is None or self._connection.socket.has_errored

    def set_alive(self) -> None:
        """Set `_alive` to True."""
        self._alive = True

    def wait_forever(self) -> None:
        """Wait infinitely."""
        while self.is_alive() and not self.has_errored():
            time.sleep(1)

    def stop(self) -> None:
        """Stop the trigger listener."""
        self._connection.disconnect()
        self._alive = False

    def restart(self) -> None:
        """Restart the subscription connection"""
        self._connection.disconnect()
        self._connection._connect()  # pylint: disable=protected-access


class _SubcriptionBuilder(WithLogger):
    """Pusher client for Composio SDK."""

    def __init__(self, client: HttpClient) -> None:
        """Initialize pusher client."""
        super().__init__()
        self._client = client
        self.api_key = self._client.api_key
        self.base_url = self._client.base_url
        self.internal = Internal(client=self._client)
        self.subscription = TriggerSubscription(client=self._client)

    def _get_connection_handler(
        self,
        project_id: str,
        pusher: Pusher,
        subscription: TriggerSubscription,
    ) -> t.Callable[[str], None]:
        def _connection_handler(_: str) -> None:
            channel = t.cast(
                PusherChannel,
                pusher.subscribe(
                    channel_name=f"private-{project_id}_triggers",
                ),
            )
            channel.bind(
                event_name="trigger_to_client",
                callback=subscription._handle_event,
            )
            channel.bind(
                event_name="chunked-trigger_to_client",
                callback=subscription._handle_chunked_events,
            )
            subscription.set_alive()
            subscription._channel = channel  # pylint: disable=protected-access
            subscription._connection = (  # pylint: disable=protected-access
                channel.connection
            )

        return _connection_handler

    def _get_pusher_instance(self) -> Pusher:
        """Get a pusher instance."""
        return Pusher(
            key=PUSHER_KEY,
            cluster=PUSHER_CLUSTER,
            auth_endpoint=PUSHER_AUTH_URL.format(base_url=self._client.base_url),
            auth_endpoint_headers={
                "x-api-key": self._client.api_key,
                "x-request-id": str(uuid.uuid4()),
            },
            auto_sub=True,
        )

    def connect(self, timeout: float = 15.0) -> TriggerSubscription:
        """Connect to Pusher channel for given client ID."""
        self.logger.debug("Creating trigger subscription")
        pusher = self._get_pusher_instance()
        project_info = self.internal.get_sdk_realtime_credentials()

        # Patch pusher logger
        pusher.connection.logger = mock.MagicMock()  # type: ignore
        pusher.connection.bind(
            "pusher:connection_established",
            self._get_connection_handler(
                project_id=project_info.project_id,
                pusher=pusher,
                subscription=self.subscription,
            ),
        )
        pusher.connect()

        # Wait for connection to get established
        deadline = time.time() + timeout
        while time.time() < deadline:
            if not self.subscription.is_alive():
                time.sleep(0.5)
                continue

            self.subscription._pusher = pusher  # pylint: disable=protected-access
            return self.subscription
        raise ComposioSDKTimeoutError(
            "Timed out while waiting for trigger listener to be established"
        )


class Triggers(Resource):
    """Triggers (instance) class"""

    enable: t.Callable
    """Enables a trigger given its id"""

    disable: t.Callable
    """Disables a trigger given its id"""

    def __init__(self, client: HttpClient):
        """
        Initialize the triggers resource.

        :param client: The client to use for the triggers resource.
        """
        self._client = client
        self._pusher_service = self.__init_pusher()

        self.list_enum = self._client.triggers_types.retrieve_enum
        self.list = self._client.triggers_types.list
        self.delete = self._client.trigger_instances.manage.delete
        self.get_type = self._client.triggers_types.retrieve
        self.enable = functools.partial(
            self._client.trigger_instances.manage.update,
            status="enable",
        )
        self.disable = functools.partial(
            self._client.trigger_instances.manage.update,
            status="disable",
        )
        self.unsubscribe = self._pusher_service.unsubscribe

    def __init_pusher(self):
        """Initialize the pusher service."""
        return Pusher(
            key=PUSHER_KEY,  # TODO: Fetch from API
            cluster=PUSHER_CLUSTER,  # TODO: Fetch from API
            auth_endpoint=PUSHER_AUTH_URL.format(base_url=self._client.base_url),
            auth_endpoint_headers={
                "x-api-key": self._client.api_key,
                "x-request-id": str(uuid.uuid4()),
            },
            auto_sub=True,
        )

    def list_active(
        self,
        trigger_ids: t.Optional[list[str]] = None,
        trigger_names: t.Optional[list[str]] = None,
        auth_config_ids: t.Optional[list[str]] = None,
        connected_account_ids: t.Optional[list[str]] = None,
        show_disabled: t.Optional[bool] = None,
        limit: t.Optional[int] = None,
        page: t.Optional[int] = None,
    ):
        """
        List all active triggers

        :param trigger_ids: List of trigger IDs to filter by
        :param trigger_names: List of trigger names to filter by
        :param auth_config_ids: List of auth config IDs to filter by
        :param connected_account_ids: List of connected account IDs to filter by
        :param show_disabled: Whether to show disabled triggers
        :param limit: Limit the number of triggers to return
        :param page: Page number to return
        :return: List of active triggers
        """
        return self._client.trigger_instances.list_active(
            query_trigger_ids_1=trigger_ids,
            query_trigger_names_1=trigger_names,
            query_auth_config_ids_1=auth_config_ids,
            query_connected_account_ids_1=connected_account_ids,
            query_show_disabled_1=show_disabled,
            limit=limit or self._client.not_given,
            page=page or self._client.not_given,
        )

    @t.overload
    def create(
        self,
        slug: str,
        *,
        connected_account_id: str,
        trigger_config: t.Optional[t.Dict[str, t.Any]] = None,
    ) -> trigger_instance_upsert_response.TriggerInstanceUpsertResponse: ...

    @t.overload
    def create(
        self,
        slug: str,
        *,
        user_id: str,
        trigger_config: t.Optional[t.Dict[str, t.Any]] = None,
    ) -> trigger_instance_upsert_response.TriggerInstanceUpsertResponse: ...

    def create(
        self,
        slug: str,
        *,
        user_id: t.Optional[str] = None,
        connected_account_id: t.Optional[str] = None,
        trigger_config: t.Optional[t.Dict[str, t.Any]] = None,
    ) -> trigger_instance_upsert_response.TriggerInstanceUpsertResponse:
        """
        Create a trigger instance

        :param slug: The slug of the trigger
        :param connected_account_id: The ID of the connected account
        :param trigger_config: The configuration of the trigger
        :return: The trigger instance
        """
        if user_id is not None:
            connected_account_id = self._get_connected_account_for_user(
                trigger=slug,
                user_id=user_id,
            )

        if connected_account_id is None:
            raise exceptions.InvalidParams(
                "please provide valid `connected_account` or `user_id`"
            )

        return self._client.trigger_instances.upsert(
            slug=slug,
            connected_account_id=connected_account_id,
            body_trigger_config_1=trigger_config or self._client.not_given,
        )

    def _get_connected_account_for_user(self, trigger: str, user_id: str) -> str:
        toolkit = self.get_type(slug=trigger).toolkit.name
        connected_accounts = self._client.connected_accounts.list(
            toolkit_slugs=[toolkit]
        )
        if len(connected_accounts.items) == 0:
            raise exceptions.NoItemsFound(
                f"No connected accounts found for {trigger} and {user_id}"
            )

        account, *_ = sorted(
            connected_accounts.items,
            key=lambda x: x.created_at,
            reverse=True,
        )
        return account.id

    def subscribe(self, timeout: float = 15.0) -> TriggerSubscription:
        """
        Subscribe to a trigger and receive trigger events.

        :param timeout: The timeout to wait for the subscription to be established.
        :return: The trigger subscription handler.
        """
        return _SubcriptionBuilder(client=self._client).connect(timeout=timeout)
