"""
Composio server object collections
"""

import difflib
import json
import time
import traceback
import typing as t
import warnings
from concurrent.futures import Future, ThreadPoolExecutor
from unittest import mock

import pysher
import requests
import typing_extensions as te
from pydantic import BaseModel, ConfigDict, Field
from pysher.channel import Channel as PusherChannel
from pysher.connection import Connection as PusherConnection

from composio.client.base import Collection
from composio.client.endpoints import v1, v2
from composio.client.enums import (
    Action,
    ActionType,
    App,
    AppType,
    Tag,
    TagType,
    Trigger,
    TriggerType,
)
from composio.constants import DEFAULT_ENTITY_ID, PUSHER_CLUSTER, PUSHER_KEY
from composio.exceptions import (
    ErrorFetchingResource,
    InvalidParams,
    InvalidTriggerFilters,
    SDKTimeoutError,
    TriggerSubscriptionError,
)
from composio.utils import help_msg, logging
from composio.utils.shared import generate_request_id


if t.TYPE_CHECKING:
    from composio.client import Composio
ALL_AUTH_SCHEMES = (
    "OAUTH2",
    "OAUTH1",
    "API_KEY",
    "BASIC",
    "BEARER_TOKEN",
    "BASIC_WITH_JWT",
    "GOOGLE_SERVICE_ACCOUNT",
    "GOOGLEADS_AUTH",
    "NO_AUTH",
    "CALCOM_AUTH",
)
AUTH_SCHEME_WITH_INITIATE = (
    "OAUTH2",
    "OAUTH1",
    "API_KEY",
    "BASIC",
    "BEARER_TOKEN",
    "BASIC_WITH_JWT",
    "GOOGLE_SERVICE_ACCOUNT",
    "GOOGLEADS_AUTH",
    "CALCOM_AUTH",
)
AuthSchemeType = t.Literal[
    "OAUTH2",
    "OAUTH1",
    "API_KEY",
    "BASIC",
    "BEARER_TOKEN",
    "BASIC_WITH_JWT",
    "GOOGLE_SERVICE_ACCOUNT",
    "GOOGLEADS_AUTH",
    "NO_AUTH",
    "CALCOM_AUTH",
]


def to_trigger_names(
    triggers: t.Union[t.List[str], t.List[Trigger], t.List[TriggerType]],
) -> str:
    """Get trigger names as a string."""
    return ",".join([Trigger(trigger).slug for trigger in triggers])


class AuthConnectionParamsModel(BaseModel):
    """
    Authentication connection parameters.
    """

    scope: t.Optional[str] = None
    base_url: t.Optional[str] = None
    client_id: t.Optional[str] = None
    token_type: t.Optional[str] = None
    access_token: t.Optional[str] = None
    refresh_token: t.Optional[str] = None
    client_secret: t.Optional[str] = None
    consumer_id: t.Optional[str] = None
    consumer_secret: t.Optional[str] = None
    headers: t.Optional[dict] = None
    queryParams: t.Optional[dict] = None


class ConnectedAccountModel(BaseModel):
    """
    Connected account data model.
    """

    id: str
    status: str
    createdAt: str
    updatedAt: str
    appUniqueId: str
    appName: str
    integrationId: str
    connectionParams: AuthConnectionParamsModel

    clientUniqueUserId: t.Optional[str] = None
    entityId: str = DEFAULT_ENTITY_ID

    # Override arbitrary model config.
    model_config: ConfigDict = ConfigDict(  # type: ignore
        arbitrary_types_allowed=True,
    )


class ConnectionRequestModel(BaseModel):
    """Connection request model."""

    model_config = ConfigDict(arbitrary_types_allowed=True)
    connectionStatus: str
    connectedAccountId: str
    redirectUrl: t.Optional[str] = None

    def save_user_access_data(
        self,
        client: "Composio",
        field_inputs: t.Dict,
        redirect_url: t.Optional[str] = None,
        entity_id: t.Optional[str] = None,
    ) -> t.Dict:
        """Save user access data."""
        connected_account = client.connected_accounts.get(  # type: ignore
            connection_id=self.connectedAccountId,
        )
        resp = client.http.post(
            url=str(v1 / "connectedAccounts"),
            json={
                "integrationId": connected_account.integrationId,
                "data": field_inputs,
                "redirectUri": redirect_url,
                "userUuid": entity_id,
            },
        )
        return resp.json()

    def wait_until_active(
        self,
        client: "Composio",
        timeout: float = 60.0,
    ) -> "ConnectedAccountModel":
        start_time = time.time()
        while time.time() - start_time < timeout:
            connection = client.connected_accounts.get(  # type: ignore
                connection_id=self.connectedAccountId,
            )
            if connection.status == "ACTIVE":
                return connection
            time.sleep(1)

        raise SDKTimeoutError(
            "Connection did not become active within the timeout period."
        )


class ConnectionAuthParam(BaseModel):
    in_: str = Field(alias="in")
    name: str
    value: str


class ConnectionParams(BaseModel):
    body: t.Dict
    base_url: str
    parameters: t.List[ConnectionAuthParam]


class ConnectedAccounts(Collection[ConnectedAccountModel]):
    """Collection of connected accounts."""

    model = ConnectedAccountModel
    endpoint = v1 / "connectedAccounts"

    @t.overload  # type: ignore
    def get(self) -> t.List[ConnectedAccountModel]:
        """
        Get all connected accounts

        :return: List of Connected accounts
        """

    @t.overload  # type: ignore
    def get(self, connection_id: str) -> ConnectedAccountModel:
        """
        Get an account by connection ID

        :param connection_id: ID of the connection to filter by
        :return: Connected account
        """

    @t.overload
    def get(
        self,
        *,
        entity_ids: t.Optional[t.Sequence[str]] = None,
        active: bool = False,
    ) -> t.List[ConnectedAccountModel]:
        """
        Get a list of connected accounts by entity IDs

        :param entity_ids: List of entity IDs to filter by
        :param active: Returns account which are currently active
        :return: List of connected accounts
        """

    def get(
        self,
        connection_id: t.Optional[str] = None,
        *,
        entity_ids: t.Optional[t.Sequence[str]] = None,
        active: bool = False,
    ) -> t.Union[ConnectedAccountModel, t.List[ConnectedAccountModel]]:
        """
        Get a list of connected accounts.

        :param entity_ids: List of entity IDs to filter by
        :param connection_id: Return the connected account by a specific
                connection ID
        :param active: Returns account which are currently active
        :return: List of connected accounts
        """
        entity_ids = entity_ids or ()
        if connection_id is not None and len(entity_ids) > 0:
            raise InvalidParams(
                message=(
                    "Cannot use both `connection_id` and `entity_ids` "
                    "parameters as filter"
                )
            )

        if connection_id is not None:
            response = self._raise_if_required(
                self.client.http.get(
                    url=str(self.endpoint / connection_id),
                )
            )
            return self.model(**response.json())

        queries = {"pageSize": "99999999"}
        if len(entity_ids) > 0:
            queries["user_uuid"] = ",".join(entity_ids)

        if active:
            queries["showActiveOnly"] = "true"

        response = self._raise_if_required(
            self.client.http.get(
                url=str(self.endpoint(queries=queries)),
            )
        )
        return [self.model(**account) for account in response.json().get("items", [])]

    def initiate(
        self,
        integration_id: str,
        entity_id: t.Optional[str] = None,
        params: t.Optional[t.Dict] = None,
        labels: t.Optional[t.List] = None,
        redirect_url: t.Optional[str] = None,
    ) -> ConnectionRequestModel:
        """Initiate a new connected account."""
        response = self._raise_if_required(
            response=self.client.http.post(
                url=str(self.endpoint),
                json={
                    "integrationId": integration_id,
                    "userUuid": entity_id,
                    "data": params or {},
                    "labels": labels or [],
                    "redirectUri": redirect_url,
                },
            )
        )
        return ConnectionRequestModel(**response.json())

    def info(self, connection_id: str) -> ConnectionParams:
        response = self._raise_if_required(
            self.client.http.get(
                url=str(self.endpoint / connection_id / "info"),
            )
        )
        return ConnectionParams(**response.json())


class AuthSchemeField(BaseModel):
    """Auth scheme field."""

    name: str
    display_name: t.Optional[str] = None
    description: str

    type: str
    default: t.Optional[str] = None
    required: bool = False
    expected_from_customer: bool = True

    get_current_user_endpoint: t.Optional[str] = None


class AppAuthScheme(BaseModel):
    """App authenticatio scheme."""

    scheme_name: str
    auth_mode: AuthSchemeType
    fields: t.List[AuthSchemeField]

    proxy: t.Optional[t.Dict] = None
    authorization_url: t.Optional[str] = None
    token_url: t.Optional[str] = None
    default_scopes: t.Optional[t.List] = None
    token_response_metadata: t.Optional[t.List] = None
    client_id: t.Optional[str] = None
    client_secret: t.Optional[str] = None


class AppModel(BaseModel):
    """App data model."""

    name: str
    key: str
    appId: str
    description: str
    categories: t.List[str]
    meta: t.Dict

    logo: t.Optional[str] = None
    docs: t.Optional[str] = None
    group: t.Optional[str] = None
    status: t.Optional[str] = None
    enabled: bool = False
    no_auth: bool = False
    auth_schemes: t.Optional[t.List[AppAuthScheme]] = None
    testConnectors: t.Optional[t.List[t.Dict[str, t.Any]]] = None
    documentation_doc_text: t.Optional[str] = None
    configuration_docs_text: t.Optional[str] = None


class Apps(Collection[AppModel]):
    """Collection of composio apps.."""

    model = AppModel
    endpoint = v1.apps

    @t.overload  # type: ignore
    def get(self) -> t.List[AppModel]:
        """Get available apps."""

    @t.overload
    def get(self, name: t.Optional[str] = None) -> AppModel:
        """Get a specific app."""

    def get(self, name: t.Optional[str] = None) -> t.Union[AppModel, t.List[AppModel]]:
        """Get apps."""
        if name is not None:
            return self.model(
                **self._raise_if_required(
                    response=self.client.http.get(
                        url=str(self.endpoint / name),
                    )
                ).json()
            )
        return super().get(queries={})


class TypeModel(BaseModel):
    type: str


class TriggerPayloadPropertyModel(BaseModel):
    """Trigger payload property data model."""

    description: str
    title: t.Optional[str] = None
    type: t.Optional[str] = None
    anyOf: t.Optional[t.List[TypeModel]] = None

    examples: t.Optional[t.List] = None


class TriggerPayloadModel(BaseModel):
    """Trigger payload data model."""

    properties: t.Dict[str, TriggerPayloadPropertyModel]
    title: t.Optional[str] = None
    type: t.Optional[str] = None
    anyOf: t.Optional[t.List[TypeModel]] = None

    required: t.Optional[t.List[str]] = None


class TriggerConfigPropertyModel(BaseModel):
    """Trigger config property data model."""

    description: str
    title: str
    default: t.Any = None

    type: t.Optional[str] = None


class TriggerConfigModel(BaseModel):
    """Trigger config data model."""

    properties: t.Dict[str, TriggerConfigPropertyModel]
    title: str

    type: t.Optional[str] = None
    required: t.Optional[t.List[str]] = None


class CallbackModel(dict):
    """Trigger callback model."""


class CallbackCollection(Collection[CallbackModel]):
    """Callback collection for triggers."""

    model = CallbackModel
    endpoint = v1.triggers

    def set(self, url: str) -> CallbackModel:
        """Set callback URL."""
        response = self._raise_if_required(
            response=self.client.http.post(
                url=str(self.endpoint / "setCallbackURL"),
                json={
                    "callbackURL": url,
                },
            )
        )
        return response.json()

    def get(self) -> str:  # type: ignore
        """Get current callback URL."""
        response = self._raise_if_required(
            response=self.client.http.get(
                url=str(self.endpoint / "callback_url"),
            )
        )
        return response.json().get("callbackURL")


class TriggerModel(BaseModel):
    """Trigger data model."""

    name: str
    display_name: str
    description: str
    payload: TriggerPayloadModel
    config: TriggerConfigModel
    instructions: str
    appId: str
    appKey: str
    appName: str
    count: int
    enabled: bool

    logo: t.Optional[str] = None


class SuccessExecuteActionResponseModel(BaseModel):
    """Success execute action response data model."""

    successfull: bool
    data: t.Dict
    error: t.Optional[str] = None


class FileType(BaseModel):
    name: str = Field(
        ..., description="File name, contains extension to indetify the file type"
    )
    content: str = Field(..., description="File content in base64")


class Connection(BaseModel):
    id: str
    integrationId: str
    clientUniqueUserId: str
    status: str


class Metadata(BaseModel):
    id: str
    connectionId: str
    triggerName: str
    triggerData: str
    triggerConfig: t.Dict[str, t.Any]
    connection: Connection


class TriggerEventData(BaseModel):
    """Trigger event payload."""

    appName: str
    payload: dict
    originalPayload: t.Dict[str, t.Any]
    metadata: Metadata

    clientId: t.Optional[int] = None


class _ChunkedTriggerEventData(BaseModel):
    """Cunked trigger event data model."""

    id: str
    index: int
    chunk: str
    final: bool


class _TriggerEventFilters(te.TypedDict):
    """Trigger event filterset."""

    app_name: te.NotRequired[AppType]
    trigger_id: te.NotRequired[str]
    connection_id: te.NotRequired[str]
    trigger_name: te.NotRequired[TriggerType]
    entity_id: te.NotRequired[str]
    integration_id: te.NotRequired[str]


TriggerCallback = t.Callable[[TriggerEventData], None]


class TriggerSubscription(logging.WithLogger):
    """Trigger subscription."""

    _pusher: pysher.Pusher
    _channel: PusherChannel
    _connection: PusherConnection
    _alive: bool

    def __init__(self, client: "Composio") -> None:
        """Initialize subscription object."""
        logging.WithLogger.__init__(self)
        self.client = client
        self._alive = False
        self._chunks: t.Dict[str, t.Dict[int, str]] = {}
        self._callbacks: t.List[t.Tuple[TriggerCallback, _TriggerEventFilters]] = []

    # pylint: disable=too-many-statements
    def validate_filters(self, filters: _TriggerEventFilters):
        docs_link_msg = "\nRead more here: https://docs.composio.dev/introduction/intro/quickstart_3"
        if not isinstance(filters, dict):
            raise InvalidParams("Expected filters to be a dictionary" + docs_link_msg)

        expected_filters = list(_TriggerEventFilters.__annotations__)
        for filter, value in filters.items():
            if filter not in expected_filters:
                error_msg = f"Unexpected filter {filter!r}"
                possible_values = difflib.get_close_matches(
                    filter, expected_filters, n=1
                )
                if possible_values:
                    (possible_value,) = possible_values
                    error_msg += f" Did you mean {possible_value!r}?"
                raise InvalidTriggerFilters(error_msg + docs_link_msg)

            # Validate app name
            if filter == "app_name":
                if isinstance(value, App):
                    slug = value.slug
                elif isinstance(value, str):
                    slug = value
                else:
                    raise InvalidTriggerFilters(
                        f"Expected 'app_name' to be App or str, found {value!r}"
                        + docs_link_msg
                    )

                # Our enums are in uppercase but we accept lowercase ones too.
                slug = slug.upper()

                # Ensure the app exists
                app_names = list(App.iter())
                if slug not in app_names:
                    error_msg = f"App {slug!r} does not exist."
                    possible_values = difflib.get_close_matches(slug, app_names, n=1)
                    if possible_values:
                        (possible_value,) = possible_values
                        error_msg += f" Did you mean {possible_value!r}?"

                    raise InvalidTriggerFilters(error_msg + docs_link_msg)

                # Ensure at least one of the app's triggers are enabled on the account.
                active_triggers = [
                    trigger.triggerName for trigger in self.client.active_triggers.get()
                ]
                apps_for_triggers = {
                    Trigger(trigger).app.upper() for trigger in active_triggers
                }
                if slug not in apps_for_triggers:
                    error_msg = (
                        f"App {slug!r} has no triggers enabled on your account.\n"
                        "Find the possible triggers by running `composio triggers`."
                    )
                    raise InvalidTriggerFilters(error_msg + docs_link_msg)

            # Validate trigger name
            if filter == "trigger_name":
                if isinstance(value, Trigger):
                    slug = value.slug
                elif isinstance(value, str):
                    slug = value
                else:
                    raise InvalidTriggerFilters(
                        f"Expected 'trigger_name' to be Trigger or str, found {value!r}"
                        + docs_link_msg
                    )

                # Our enums are in uppercase but we accept lowercase ones too.
                slug = slug.upper()

                # Ensure the trigger exists
                trigger_names = list(Trigger.iter())
                if slug not in trigger_names:
                    error_msg = f"Trigger {slug!r} does not exist."
                    possible_values = difflib.get_close_matches(
                        slug, trigger_names, n=1
                    )
                    if possible_values:
                        (possible_value,) = possible_values
                        error_msg += f" Did you mean {possible_value!r}?"

                    raise InvalidTriggerFilters(error_msg + docs_link_msg)

                # Ensure the trigger is added on your account
                active_triggers = [
                    trigger.triggerName for trigger in self.client.active_triggers.get()
                ]
                if slug not in active_triggers:
                    error_msg = (
                        f"Trigger {slug!r} is not enabled on your account.\nEnable"
                        f" the trigger by doing `composio triggers enable {slug}`."
                    )
                    raise InvalidTriggerFilters(error_msg + docs_link_msg)

    def callback(
        self,
        filters: t.Optional[_TriggerEventFilters] = None,
    ) -> t.Callable[[TriggerCallback], TriggerCallback]:
        """Register a trigger callaback."""
        # Ensure filters is the right type before we stuff it in the callbacks
        if filters is not None:
            self.validate_filters(filters)

        def _wrap(f: TriggerCallback) -> TriggerCallback:
            self._callbacks.append((f, filters or {}))
            return f

        return _wrap

    def _handle_callback(
        self,
        callback: TriggerCallback,
        data: TriggerEventData,
        filters: _TriggerEventFilters,
    ) -> t.Any:
        """Handle callback."""
        for name, check in (
            ("app_name", data.appName),
            ("trigger_id", data.metadata.id),
            ("connection_id", data.metadata.connectionId),
            ("trigger_name", data.metadata.triggerName),
            ("entity_id", data.metadata.connection.clientUniqueUserId),
            ("integration_id", data.metadata.connection.integrationId),
        ):
            value = filters.get(name)
            if value is None or str(value).lower() == check.lower():
                continue

            self.logger.debug(
                f"Skipping `{callback.__name__}` since "
                f"`{name}` filter does not match the event metadata",
            )
            return None

        try:
            return callback(data)
        except BaseException:
            self.logger.info(
                f"Error executing `{callback.__name__}` for "
                f"event `{data.metadata.triggerName}` "
                f"with error:\n {traceback.format_exc()}"
            )
            return None

    def _parse_payload(self, event: str) -> t.Optional[TriggerEventData]:
        """Parse event payload."""
        try:
            return TriggerEventData(**json.loads(event))
        except Exception as e:
            self.logger.warning(f"Error decoding payload: {e}")
            return None

    def handle_event(self, event: str) -> None:
        """Filter events and call the callback function."""
        data = self._parse_payload(event=event)
        if data is None:
            self.logger.error(f"Error parsing trigger payload: {event}")
            return

        self.logger.debug(
            f"Received trigger event with trigger ID: {data.metadata.id} "
            f"and trigger name: {data.metadata.triggerName}"
        )
        awaitables: t.List[Future] = []
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

    def handle_chunked_events(self, event: str) -> None:
        """Handle chunked events."""
        data = _ChunkedTriggerEventData(**json.loads(event))
        if data.id not in self._chunks:
            self._chunks[data.id] = {}

        self._chunks[data.id][data.index] = data.chunk
        if data.final:
            _chunks = self._chunks.pop(data.id)
            self.handle_event(
                event="".join([_chunks[idx] for idx in sorted(_chunks)]),
            )

    def is_alive(self) -> bool:
        """Check if subscription is live."""
        return self._alive

    def has_errored(self) -> bool:
        """Check if the connection errored and disconnected."""
        return self._connection.socket is None or self._connection.socket.has_errored

    def set_alive(self) -> None:
        """Set `_alive` to True."""
        self._alive = True

    @te.deprecated("Use `wait_forever` instead")
    def listen(self) -> None:
        """Wait infinitely."""
        self.wait_forever()

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


class _PusherClient(logging.WithLogger):
    """Pusher client for Composio SDK."""

    def __init__(self, client_id: str, client: "Composio") -> None:
        """Initialize pusher client."""
        super().__init__()
        self.client_id = client_id
        self.client = client
        self.api_key = self.client.api_key
        self.base_url = self.client.http.base_url
        self.subscription = TriggerSubscription(client=self.client)

    def _get_connection_handler(
        self,
        client_id: str,
        pusher: pysher.Pusher,
        subscription: TriggerSubscription,
    ) -> t.Callable[[str], None]:
        def _connection_handler(_: str) -> None:
            channel = t.cast(
                PusherChannel,
                pusher.subscribe(
                    channel_name=f"private-{client_id}_triggers",
                ),
            )
            channel.bind(
                event_name="trigger_to_client",
                callback=subscription.handle_event,
            )
            channel.bind(
                event_name="chunked-trigger_to_client",
                callback=subscription.handle_chunked_events,
            )
            subscription.set_alive()
            subscription._channel = channel  # pylint: disable=protected-access
            subscription._connection = (  # pylint: disable=protected-access
                channel.connection
            )

        return _connection_handler

    def connect(self, timeout: float = 15.0) -> TriggerSubscription:
        """Connect to Pusher channel for given client ID."""
        # Make a request to the Pusher webhook endpoint
        try:
            response = requests.post(
                url=f"{self.base_url}/v1/triggers/pusher",
                json={
                    "time": int(time.time() * 1000),  # Current time in milliseconds
                    "events": [
                        {
                            "name": "channel_occupied",
                            "channel": f"private-{self.client_id}_triggers",
                        }
                    ],
                },
                timeout=timeout,
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
        except requests.RequestException as e:
            self.logger.error(f"Failed to send Pusher webhook: {e}")

        pusher = pysher.Pusher(
            key=PUSHER_KEY,
            cluster=PUSHER_CLUSTER,
            auth_endpoint=f"{self.base_url}/v1/client/auth/pusher_auth?fromPython=true",
            auth_endpoint_headers={
                "x-api-key": self.api_key,
                "x-request-id": generate_request_id(),
            },
            auto_sub=True,
        )

        # Patch pusher logger
        pusher.connection.logger = mock.MagicMock()  # type: ignore
        pusher.connection.bind(
            "pusher:connection_established",
            self._get_connection_handler(
                client_id=self.client_id,
                pusher=pusher,
                subscription=self.subscription,
            ),
        )
        pusher.connect()

        # Wait for connection to get established
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.subscription.is_alive():
                self.subscription._pusher = pusher  # pylint: disable=protected-access
                return self.subscription
            time.sleep(0.5)

        raise SDKTimeoutError(
            "Timed out while waiting for trigger listener to be established"
        )


class Triggers(Collection[TriggerModel]):
    """Collection of triggers."""

    model = TriggerModel
    endpoint = v1.triggers
    callbacks: CallbackCollection

    def __init__(self, client: "Composio") -> None:
        """Initialize triggers collections."""
        super().__init__(client)
        self.callbacks = CallbackCollection(
            client=self.client,
        )

    def get(  # type: ignore
        self,
        trigger_names: t.Optional[t.List[TriggerType]] = None,
        apps: t.Optional[t.List[str]] = None,
    ) -> t.List[TriggerModel]:
        """
        List active triggers

        :param trigger_names: Trigger names to filter by, can be a list of strings or Trigger objects
        :param app_names: App names to filter by
        :return: List of triggers filtered by provided parameters
        """
        queries = {}
        if trigger_names is not None and len(trigger_names) > 0:
            queries["triggerIds"] = to_trigger_names(trigger_names)
        if apps is not None and len(apps) > 0:
            queries["appNames"] = ",".join(apps)
        return super().get(queries=queries)

    def enable(
        self, name: str, connected_account_id: str, config: t.Dict[str, t.Any]
    ) -> t.Dict:
        """
        Enable a trigger

        :param name: Name of the trigger
        :param connected_account_id: ID of the relevant connected account
        """
        response = self._raise_if_required(
            self.client.http.post(
                url=str(self.endpoint.enable / connected_account_id / name),
                json={"triggerConfig": config},
            )
        )
        return response.json()

    def disable(self, id: str) -> t.Dict:
        """
        Disable a trigger

        :param name: Name of the trigger
        :param connected_account_id: ID of the relevant connected account
        """
        response = self._raise_if_required(
            self.client.http.patch(
                url=str(self.endpoint / "instance" / id / "status"),
                json={
                    "enabled": False,
                },
            )
        )
        return response.json()

    def delete(self, id: str) -> t.Dict:
        """
        Delete a trigger

        :param id: ID of the trigger to be deleted
        """
        response = self._raise_if_required(
            self.client.http.delete(url=str(self.endpoint / "instance" / id))
        )
        return response.json()

    def subscribe(self, timeout: float = 15.0) -> TriggerSubscription:
        """Subscribe to a trigger and receive trigger events."""
        self.logger.debug("Creating trigger subscription")
        response = self._raise_if_required(
            response=self.client.http.get(
                url="/v1/client/auth/client_info",
            )
        )
        client_id = response.json().get("client", {}).get("id")
        if client_id is None:
            raise TriggerSubscriptionError("Error fetching client ID")

        pusher = _PusherClient(
            client_id=client_id,
            client=self.client,
        )
        return pusher.connect(
            timeout=timeout,
        )


class ActiveTriggerModel(BaseModel):
    """Active trigger data model."""

    id: str
    connectionId: str
    triggerName: str
    triggerConfig: dict


class ActiveTriggers(Collection[ActiveTriggerModel]):
    """Collection of active triggers."""

    model = ActiveTriggerModel
    endpoint = v1.triggers / "active_triggers"

    _list_key = "triggers"

    def get(  # type: ignore
        self,
        trigger_ids: t.Optional[t.List[str]] = None,
        connected_account_ids: t.Optional[t.List[str]] = None,
        integration_ids: t.Optional[t.List[str]] = None,
        trigger_names: t.Optional[t.List[t.Union[str, Trigger]]] = None,
    ) -> t.List[ActiveTriggerModel]:
        """List active triggers."""
        trigger_ids = trigger_ids or []
        connected_account_ids = connected_account_ids or []
        integration_ids = integration_ids or []
        trigger_names = trigger_names or []
        queries = {}
        if len(trigger_ids) > 0:
            queries["triggerIds"] = ",".join(trigger_ids)
        if len(connected_account_ids) > 0:
            queries["connectedAccountIds"] = ",".join(connected_account_ids)
        if len(integration_ids) > 0:
            queries["integrationIds"] = ",".join(integration_ids)
        if len(trigger_names) > 0:
            queries["triggerNames"] = to_trigger_names(trigger_names)
        return super().get(queries=queries)


class OpenAPISchema(BaseModel):
    properties: t.Dict[str, t.Any]
    title: str
    type: str
    required: t.Optional[t.List[str]] = None
    examples: t.Optional[t.List[t.Any]] = None


class ActionParametersModel(OpenAPISchema):
    """Action parameter data models."""


class ActionResponseModel(OpenAPISchema):
    """Action response data model."""


class ActionModel(BaseModel):
    """Action data model."""

    name: str
    description: str
    parameters: ActionParametersModel
    response: ActionResponseModel
    appName: str
    appId: str
    version: str
    available_versions: t.List[str]

    tags: t.List[str]
    logo: t.Optional[str] = None

    display_name: t.Optional[str] = None
    enabled: bool = False


ParamPlacement = t.Literal["header", "path", "query", "subdomain", "metadata"]


class CustomAuthParameter(te.TypedDict):
    in_: ParamPlacement
    name: str
    value: str


class CustomAuthObject(BaseModel):
    body: t.Dict = Field(default_factory=lambda: {})
    base_url: t.Optional[str] = None
    parameters: t.List[CustomAuthParameter] = Field(default_factory=lambda: [])


class SearchResultTask(BaseModel):

    app: str = Field(
        description="Name of the app required to perform the subtask.",
    )
    actions: list[str] = Field(
        description=(
            "List of possible actions in order of relevance that can be used to "
            "perform the task, provide minimum of {-min_actions-} and maximum of "
            "{-max_actions-} actions."
        ),
    )
    description: str = Field(
        description="Descrption of the subtask.",
    )
    order: int = Field(
        description="Order of the subtask, SHOULD START FROM 0",
    )


class CreateUploadURLResponse(BaseModel):
    id: str = Field(..., description="ID of the file")
    url: str = Field(..., description="Onetime upload URL")
    key: str = Field(..., description="S3 upload location")
    exists: bool = Field(False, description="If the file already exists on S3")


class Actions(Collection[ActionModel]):
    """Collection of composio actions.."""

    model = ActionModel
    endpoint = v2.actions

    def _get_action(self, action: ActionType) -> ActionModel:
        return self.model(
            **self._raise_if_required(
                response=self.client.http.get(
                    url=str(self.endpoint / str(action)),
                    params={
                        "version": Action(action).version,
                    },
                )
            ).json()
        )

    def _get_actions(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.Sequence[TagType]] = None,
        limit: t.Optional[int] = None,
        use_case: t.Optional[str] = None,
        allow_all: bool = False,
    ) -> t.List[ActionModel]:

        def is_action(obj):
            try:
                return hasattr(obj, "app")
            except AttributeError:
                return False

        actions = t.cast(
            t.List[Action],
            [
                action if is_action(action) else Action(action)
                for action in actions or []
            ],
        )
        apps = t.cast(t.List[App], [App(app) for app in apps or []])
        tags = t.cast(t.List[Tag], [Tag(tag) for tag in tags or []])

        # Filter out local apps and actions
        local_apps = [app for app in apps if app.is_local]
        local_actions = [action for action in actions if action.is_local]
        apps = [app for app in apps if not app.is_local]
        actions = [action for action in actions if not action.is_local]
        only_local_apps = (
            len(apps) == 0
            and len(actions) == 0
            and (len(local_apps) > 0 or len(local_actions) > 0)
        )
        if only_local_apps:
            local_items = self.client.local.get_action_schemas(
                apps=local_apps,
                actions=local_actions,
                tags=tags,
            )
            return [self.model(**item) for item in local_items]

        if len(actions) > 0 and len(apps) > 0:
            raise ErrorFetchingResource(
                "Error retrieving Actions, Both actions and apps "
                "cannot be used as filters at the same time."
            )

        if len(actions) > 0 and len(tags) > 0:
            raise ErrorFetchingResource(
                "Error retrieving Actions, Both actions and tags "
                "cannot be used as filters at the same time."
            )

        if len(apps) > 0 and len(tags) == 0 and not allow_all:
            warnings.warn(
                "Using all actions of an app is not recommended for production."
                "Learn more: https://docs.composio.dev/patterns/tools/use-tools/use-specific-actions\n\n"
                + help_msg(),
                UserWarning,
            )
            tags = ["important"]

        if (
            len(actions) == 0
            and len(apps) == 0
            and len(tags) == 0
            and allow_all
            and len(local_apps) == 0
            and len(local_actions) == 0
        ):
            response = self._raise_if_required(
                response=self.client.http.get(
                    url=str(self.endpoint),
                )
            )
            return [self.model(**action) for action in response.json().get("items")]

        queries: t.Dict[str, str] = {}
        if use_case is not None and use_case != "":
            queries["useCase"] = use_case

        if len(apps) > 0:
            queries["apps"] = ",".join(list(map(lambda x: t.cast(App, x).slug, apps)))

        if len(actions) > 0:
            queries["apps"] = ",".join(
                set(map(lambda x: t.cast(Action, x).app, actions))
            )

        if limit is not None:
            queries["limit"] = str(limit)

        response = self._raise_if_required(
            response=self.client.http.get(
                url=str(
                    self.endpoint(
                        queries=queries,
                    )
                )
            )
        )

        response_json = response.json()
        items = [self.model(**action) for action in response_json.get("items")]
        if len(actions) > 0:
            required = [t.cast(Action, action).slug for action in actions]
            items = [item for item in items if item.name in required]

        if len(tags) > 0:
            required_tags = [tag.app if isinstance(tag, Tag) else tag for tag in tags]
            only_important_tag = required_tags == ["important"]
            should_not_filter_using_tags = len(items) < 15 and only_important_tag
            if not should_not_filter_using_tags:
                filtered_items = [
                    item
                    for item in items
                    if any(tag in required_tags for tag in item.tags)
                ]
                if len(filtered_items) > 0 or not only_important_tag:
                    items = filtered_items

        if len(local_apps) > 0 or len(local_actions) > 0:
            local_items = self.client.local.get_action_schemas(
                apps=local_apps, actions=local_actions, tags=tags
            )
            items = [self.model(**item) for item in local_items] + items
        return items

    @t.overload  # type: ignore
    def get(self) -> t.List[ActionModel]: ...

    @t.overload  # type: ignore
    def get(self, action: t.Optional[ActionType] = None) -> ActionModel: ...

    @t.overload  # type: ignore
    def get(
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.Sequence[TagType]] = None,
        limit: t.Optional[int] = None,
        use_case: t.Optional[str] = None,
        allow_all: bool = False,
    ) -> t.List[ActionModel]: ...

    def get(  # type: ignore
        self,
        action: t.Optional[ActionType] = None,
        *,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.Sequence[TagType]] = None,
        limit: t.Optional[int] = None,
        use_case: t.Optional[str] = None,
        allow_all: bool = False,
    ) -> t.Union[ActionModel, t.List[ActionModel]]:
        """
        Get a list of apps by the specified filters.

        :param actions: Filter by the list of Actions.
        :param action: Get data for this action.
        :param apps: Filter by the list of Apps.
        :param tags: Filter by the list of given Tags.
        :param limit: Limit the number of actions to a specific number.
        :param use_case: Filter by use case.
        :param allow_all: Allow querying all of the actions for a specific
                        app
        :return: List of actions
        """
        if action is not None:
            return self._get_action(action=action)

        return self._get_actions(
            actions=actions,
            apps=apps,
            tags=tags,
            limit=limit,
            use_case=use_case,
            allow_all=allow_all,
        )

    @staticmethod
    def _serialize_auth(auth: t.Optional[CustomAuthObject]) -> t.Optional[t.Dict]:
        if auth is None:
            return None

        data = auth.model_dump(exclude_none=True)
        data["parameters"] = [
            {"in": d["in_"], "name": d["name"], "value": d["value"]}
            for d in data["parameters"]
        ]
        for param in data["parameters"]:
            if param["in"] == "metadata":
                raise InvalidParams(
                    "Param placement cannot be 'metadata' for remote "
                    f"action execution: {param}"
                )
        return data

    def execute(
        self,
        action: Action,
        params: t.Dict,
        entity_id: str = "default",
        connected_account: t.Optional[str] = None,
        session_id: t.Optional[str] = None,
        text: t.Optional[str] = None,
        auth: t.Optional[CustomAuthObject] = None,
        allow_tracing: bool = False,
    ) -> t.Dict:
        """
        Execute an action on the specified entity with optional connected account.

        :param action: The Action object to be executed.
        :param params: A dictionary of parameters to be passed to the action.
        :param entity_id: The unique identifier of the entity on which the action is executed.
        :param connected_account: Optional connected account ID if required for the action.
        :param session_id: ID of the current workspace session
        :return: A dictionary containing the response from the executed action.
        """
        if action.no_auth:
            return self._raise_if_required(
                self.client.long_timeout_http.post(
                    url=str(self.endpoint / action.slug / "execute"),
                    json={
                        "appName": action.app,
                        "input": params,
                        "text": text,
                        "version": action.version,
                        "sessionInfo": {
                            "sessionId": session_id,
                        },
                        "allowTracing": allow_tracing,
                    },
                )
            ).json()

        if connected_account is None and auth is None:
            raise InvalidParams(
                "`connected_account` cannot be `None` when executing "
                "an app which requires authentication"
            )

        return self._raise_if_required(
            self.client.long_timeout_http.post(
                url=str(self.endpoint / action.slug / "execute"),
                json={
                    "connectedAccountId": connected_account,
                    "entityId": entity_id,
                    "appName": action.app,
                    "input": params,
                    "text": text,
                    "version": action.version,
                    "authConfig": self._serialize_auth(auth=auth),
                    "sessionInfo": {
                        "sessionId": session_id,
                    },
                    "allowTracing": allow_tracing,
                },
            )
        ).json()

    def request(
        self,
        connection_id: str,
        endpoint: str,
        method: str,
        body: t.Optional[t.Dict] = None,
        parameters: t.Optional[t.List[CustomAuthParameter]] = None,
    ) -> t.Dict:
        return self.client.http.post(
            url=str(self.endpoint / "proxy"),
            json={
                "connectedAccountId": connection_id,
                "body": body,
                "method": method.upper(),
                "endpoint": endpoint,
                "parameters": [
                    {
                        "in": param["in_"],
                        "name": param["name"],
                        "value": param["value"],
                    }
                    for param in parameters or []
                ],
            },
        ).json()

    def search_for_a_task(
        self,
        use_case: str,
        limit: t.Optional[int] = None,
        min_actions_per_task: t.Optional[int] = None,
        max_actions_per_task: t.Optional[int] = None,
        apps: t.Optional[t.List[str]] = None,
    ) -> t.List[SearchResultTask]:
        params: t.Dict[str, t.Any] = {"useCase": use_case}
        if limit is not None:
            params["limit"] = limit

        if min_actions_per_task is not None:
            params["minActionsPerTask"] = min_actions_per_task

        if max_actions_per_task is not None:
            params["maxActionsPerTask"] = max_actions_per_task

        if apps is not None:
            params["apps"] = ",".join(apps)

        response = self._raise_if_required(
            response=self.client.http.get(
                str(self.endpoint / "search" / "advanced"),
                params=params,
            )
        )

        return [
            SearchResultTask.model_validate(task)
            for task in response.json().get("items", [])
        ]

    def create_file_upload(
        self,
        app: str,
        action: str,
        filename: str,
        mimetype: str,
        md5: str,
    ) -> CreateUploadURLResponse:
        return CreateUploadURLResponse(
            **self._raise_if_required(
                response=self.client.http.post(
                    url=str(self.endpoint / "files" / "upload" / "request"),
                    json={
                        "md5": md5,
                        "app": app,
                        "action": action,
                        "filename": filename,
                        "mimetype": mimetype,
                    },
                )
            ).json()
        )


class ExpectedFieldInput(BaseModel):
    name: str
    type: str

    description: str
    displayName: str
    is_secret: bool = False

    required: bool = True
    expected_from_customer: bool = True

    default: t.Optional[str] = None
    get_current_user_endpoint: t.Optional[str] = None


class IntegrationModel(BaseModel):
    """Integration data model."""

    id: str
    name: str
    authScheme: str
    createdAt: str
    updatedAt: str
    enabled: bool
    deleted: bool
    appId: str
    appName: str
    expectedInputFields: t.List[ExpectedFieldInput] = Field(default_factory=lambda: [])

    _count: t.Dict

    logo: t.Optional[str] = None
    defaultConnectorId: t.Optional[str] = None
    connections: t.Optional[t.List[t.Dict]] = None


class Integrations(Collection[IntegrationModel]):
    """
    Collection of composio integrations.
    """

    model = IntegrationModel
    endpoint = v1.integrations

    def create(
        self,
        app_id: str,
        name: t.Optional[str] = None,
        auth_mode: t.Optional["AuthSchemeType"] = None,
        auth_config: t.Optional[t.Dict[str, t.Any]] = None,
        use_composio_auth: bool = False,
        force_new_integration: bool = False,
    ) -> IntegrationModel:
        """
        Create a new integration

        :param app_id: App ID string.
        :param name: Name of the integration.
        :param auth_param: Auth mode string.
        :param auth_config: Authentication configuration.
        :param use_composio_auth: Whether to use default composio auth or not
        :return: Integration model created by the request.
        """
        request = {
            "appId": app_id,
            "useComposioAuth": use_composio_auth,
        }

        if name is not None:
            request["name"] = name

        if auth_mode is not None:
            request["authScheme"] = auth_mode

        if auth_config is not None:
            request["authConfig"] = auth_config or {}

        if force_new_integration:
            request["forceNewIntegration"] = force_new_integration

        response = self._raise_if_required(
            response=self.client.http.post(
                url=str(self.endpoint),
                json=request,
            )
        )
        return IntegrationModel(**response.json())

    def remove(self, id: str) -> None:
        self.client.http.delete(url=str(self.endpoint / id))

    @t.overload  # type: ignore
    def get(
        self,
        *,
        page_size: t.Optional[int] = None,
        page: t.Optional[int] = None,
        app_id: t.Optional[str] = None,
        app_name: t.Optional[str] = None,
        show_disabled: t.Optional[bool] = None,
    ) -> t.List[IntegrationModel]: ...

    @t.overload
    def get(self, id: t.Optional[str] = None) -> IntegrationModel: ...

    def get(
        self,
        id: t.Optional[str] = None,
        *,
        page_size: t.Optional[int] = None,
        page: t.Optional[int] = None,
        app_id: t.Optional[str] = None,
        app_name: t.Optional[str] = None,
        show_disabled: t.Optional[bool] = None,
    ) -> t.Union[t.List[IntegrationModel], IntegrationModel]:
        if id is not None:
            return IntegrationModel(
                **self._raise_if_required(
                    self.client.http.get(url=str(self.endpoint / id))
                ).json()
            )
        quries = {}
        if page_size is not None:
            quries["pageSize"] = json.dumps(page_size)

        if page is not None:
            quries["page"] = json.dumps(page)

        if app_id is not None:
            quries["appId"] = app_id

        if app_name is not None:
            quries["appName"] = app_name

        if show_disabled is not None:
            quries["showDisabled"] = json.dumps(show_disabled)

        return super().get(queries=quries)

    @te.deprecated("`get_id` is deprecated, use `get(id=id)`")
    def get_by_id(
        self,
        integration_id: str,
    ) -> IntegrationModel:
        """
        Get an integration by its ID.

        :param integration_id: Integration ID string.
        :return: Integration model.
        """
        response = self._raise_if_required(
            self.client.http.get(url=str(self.endpoint / integration_id))
        )
        return IntegrationModel(**response.json())


class LogRecord(BaseModel):
    pass


class Logs(Collection[LogRecord]):
    """
    Logs endpoint.
    """

    model = LogRecord
    endpoint = v1.logs

    def push(self, record: t.Dict) -> None:
        """Push logs to composio."""
        # TODO: handle this better
        if self.client._api_key is None:  # pylint: disable=protected-access
            return

        self.client.http.post(url=str(self.endpoint), json=record)
