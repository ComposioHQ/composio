"""
Composio server object collections
"""

import base64
import json
import os
import time
import traceback
import typing as t
import warnings
from concurrent.futures import Future, ThreadPoolExecutor
from unittest import mock

import pysher
import typing_extensions as te
from pydantic import BaseModel, ConfigDict, Field
from pysher.channel import Channel

from composio.client.base import BaseClient, Collection
from composio.client.endpoints import v1
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
from composio.client.exceptions import ComposioClientError
from composio.constants import PUSHER_CLUSTER, PUSHER_KEY
from composio.utils import logging


def to_trigger_names(
    triggers: t.Union[t.List[str], t.List[Trigger], t.List[TriggerType]]
) -> str:
    """Get trigger names as a string."""
    return ",".join([Trigger(trigger).name for trigger in triggers])


class AuthConnectionParamsModel(BaseModel):
    """
    Authentication connection parameters.
    """

    scope: t.Optional[str] = None
    base_url: t.Optional[str] = None
    client_id: t.Optional[str] = None
    token_type: t.Optional[str] = None
    access_token: t.Optional[str] = None
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
    integrationId: str
    connectionParams: AuthConnectionParamsModel

    clientUniqueUserId: t.Optional[str] = None

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
        client: BaseClient,
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
        client: BaseClient,
        timeout=60,
    ) -> "ConnectedAccountModel":
        start_time = time.time()
        while time.time() - start_time < timeout:
            connection = client.connected_accounts.get(  # type: ignore
                connection_id=self.connectedAccountId,
            )
            if connection.status == "ACTIVE":
                return connection
            time.sleep(1)

        # TODO: Replace with timeout error.
        raise ComposioClientError(
            "Connection did not become active within the timeout period."
        )


class ConnectedAccounts(Collection[ConnectedAccountModel]):
    """Collection of connected accounts."""

    model = ConnectedAccountModel
    endpoint = v1 / "connectedAccounts"

    @t.overload  # type: ignore
    def get(self, connection_id: t.Optional[str] = None) -> ConnectedAccountModel:
        """
        Get an account by connection ID

        :param connection_id: ID of the connection to filter by
        :return: Connected account
        """

    @t.overload
    def get(
        self,
        connection_id: t.Optional[str] = None,
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
            raise ComposioClientError(
                message="Cannot use both `connection_id` and `entity_ids` parameters as filter"
            )

        if connection_id is not None:
            response = self._raise_if_required(
                self.client.http.get(
                    url=str(self.endpoint / connection_id),
                )
            )
            return self.model(**response.json())

        quries = {}
        if len(entity_ids) > 0:
            quries["user_uuid"] = ",".join(entity_ids)

        if active:
            quries["showActiveOnly"] = "true"

        response = self._raise_if_required(
            self.client.http.get(
                url=str(self.endpoint(queries=quries)),
            )
        )
        return [self.model(**account) for account in response.json().get("items", [])]

    def initiate(
        self,
        integration_id: str,
        entity_id: t.Optional[str] = None,
        params: t.Optional[t.Dict] = None,
        redirect_url: t.Optional[str] = None,
    ) -> ConnectionRequestModel:
        """Initiate a new connected accont."""
        response = self._raise_if_required(
            response=self.client.http.post(
                url=str(self.endpoint),
                json={
                    "integrationId": integration_id,
                    "userUuid": entity_id,
                    "data": params or {},
                    "redirectUri": redirect_url,
                },
            )
        )
        return ConnectionRequestModel(**response.json())


class AuthSchemeField(BaseModel):
    """Auth scheme field."""

    name: str
    description: str
    type: str

    display_name: t.Optional[str] = None

    required: bool = False
    expected_from_customer: bool = True


class AppAuthScheme(BaseModel):
    """App authenticatio scheme."""

    scheme_name: str
    auth_mode: str
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
    title: str
    type: t.Optional[str] = None
    anyOf: t.Optional[t.List[TypeModel]] = None

    examples: t.Optional[t.List] = None


class TriggerPayloadModel(BaseModel):
    """Trigger payload data model."""

    properties: t.Dict[str, TriggerPayloadPropertyModel]
    title: str
    type: t.Optional[str] = None
    anyOf: t.Optional[t.List[TypeModel]] = None

    required: t.Optional[t.List[str]] = None


class TriggerConfigPropertyModel(BaseModel):
    """Trigger config property data model."""

    description: str
    title: str

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

    app_name: te.NotRequired[str]
    trigger_id: te.NotRequired[str]
    connection_id: te.NotRequired[str]
    trigger_name: te.NotRequired[str]
    entity_id: te.NotRequired[str]
    integration_id: te.NotRequired[str]


TriggerCallback = t.Callable[[TriggerEventData], None]


class TriggerSubscription(logging.WithLogger):
    """Trigger subscription."""

    _channel: Channel
    _alive: bool

    def __init__(self) -> None:
        """Initialize subscription object."""
        logging.WithLogger.__init__(self)
        self._alive = False
        self._chunks: t.Dict[str, t.Dict[int, str]] = {}
        self._callbacks: t.List[t.Tuple[TriggerCallback, _TriggerEventFilters]] = []

    def callback(
        self,
        filters: t.Optional[_TriggerEventFilters] = None,
    ) -> t.Callable[[TriggerCallback], TriggerCallback]:
        """Register a trigger callaback."""

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
            if value is None or value == check:
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
                f"Erorr executing `{callback.__name__}` for "
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

        self.logger.info(
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

    def set_alive(self) -> None:
        """Set `_alive` to True."""
        self._alive = True

    def listen(self) -> None:
        """Wait infinitely."""
        while True:
            time.sleep(1)


class _PusherClient(logging.WithLogger):
    """Pusher client for Composio SDK."""

    def __init__(self, client_id: str, base_url: str, api_key: str) -> None:
        """Initialize pusher client."""
        super().__init__()
        self.client_id = client_id
        self.base_url = base_url
        self.api_key = api_key
        self.subscription = TriggerSubscription()

    def _get_connection_handler(
        self,
        client_id: str,
        pusher: pysher.Pusher,
        subscription: TriggerSubscription,
    ) -> t.Callable[[str], None]:
        def _connection_handler(_: str) -> None:
            channel = t.cast(
                Channel,
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

        return _connection_handler

    def connect(self, timeout: float = 15.0) -> TriggerSubscription:
        """Connect to Pusher channel for given client ID."""
        pusher = pysher.Pusher(
            key=PUSHER_KEY,
            cluster=PUSHER_CLUSTER,
            auth_endpoint=f"{self.base_url}/v1/client/auth/pusher_auth?fromPython=true",
            auth_endpoint_headers={
                "x-api-key": self.api_key,
            },
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
                return self.subscription
            time.sleep(0.5)
        raise TimeoutError(
            "Timed out while waiting for trigger listener to be established"
        )


class Triggers(Collection[TriggerModel]):
    """Collection of triggers."""

    model = TriggerModel
    endpoint = v1.triggers
    callbacks: CallbackCollection

    def __init__(self, client: BaseClient) -> None:
        """Initialize triggers collections."""
        super().__init__(client)
        self.callbacks = CallbackCollection(
            client=self.client,
        )

    def get(  # type: ignore
        self,
        triggers: t.Optional[t.List[TriggerType]] = None,
        apps: t.Optional[t.List[str]] = None,
    ) -> t.List[TriggerModel]:
        """
        List active triggers

        :param trigger_names: Trigger names to filter by, can be a list of strings or Trigger objects
        :param app_names: App names to filter by
        :return: List of triggers filtered by provided parameters
        """
        queries = {}
        if triggers is not None and len(triggers) > 0:
            queries["triggerIds"] = to_trigger_names(triggers)
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

    def subscribe(self, timeout: float = 15.0) -> TriggerSubscription:
        """Subscribe to a trigger and receive trigger events."""
        self.logger.info("Creating trigger subscription")
        response = self._raise_if_required(
            response=self.client.http.get(
                url="/v1/client/auth/client_info",
            )
        )
        client_id = response.json().get("client", {}).get("id")
        if client_id is None:
            raise ComposioClientError("Error fetching client ID")

        pusher = _PusherClient(
            client_id=client_id,
            base_url=self.client.http.base_url,
            api_key=self.client.api_key,
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
        return self._raise_if_empty(super().get(queries=queries))


def _check_file_uploadable(param_field: dict) -> bool:
    return (
        isinstance(param_field, dict)
        and (param_field.get("title") in ["File", "FileType"])
        and all(
            field_name in param_field.get("properties", {})
            for field_name in ["name", "content"]
        )
    )


def _check_file_downloadable(param_field: dict) -> bool:
    return set(param_field.keys()) == {"name", "content"}


class ActionParametersModel(BaseModel):
    """Action parameter data models."""

    properties: t.Dict[str, t.Any]
    title: str
    type: str

    required: t.Optional[t.List[str]] = None


class ActionResponseModel(BaseModel):
    """Action response data model."""

    properties: t.Dict[str, t.Any]
    title: str
    type: str

    required: t.Optional[t.List[str]] = None


class ActionModel(BaseModel):
    """Action data model."""

    name: str
    display_name: t.Optional[str] = None
    parameters: ActionParametersModel
    response: ActionResponseModel
    appName: str
    appId: str
    tags: t.List[str]
    enabled: bool = False

    logo: t.Optional[str] = None
    description: t.Optional[str] = None


class Actions(Collection[ActionModel]):
    """Collection of composio actions.."""

    model = ActionModel
    endpoint = v1.actions

    # TODO: Overload
    def get(  # type: ignore
        self,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        apps: t.Optional[t.Sequence[AppType]] = None,
        tags: t.Optional[t.Sequence[TagType]] = None,
        limit: t.Optional[int] = None,
        use_case: t.Optional[str] = None,
        allow_all: bool = False,
    ) -> t.List[ActionModel]:
        """
        Get a list of apps by the specified filters.

        :param actions: Filter by the list of Actions.
        :param apps: Filter by the list of Apps.
        :param tags: Filter by the list of given Tags.
        :param limit: Limit the numnber of actions to a specific number.
        :param use_case: Filter by use case.
        :param allow_all: Allow querying all of the actions for a specific
                        app
        :return: List of actions
        """
        actions = t.cast(t.List[Action], [Action(action) for action in actions or []])
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
            raise ComposioClientError(
                "Error retrieving Actions, Both actions and apps "
                "cannot be used as filters at the same time."
            )

        if len(actions) > 0 and len(tags) > 0:
            raise ComposioClientError(
                "Error retrieving Actions, Both actions and tags "
                "cannot be used as filters at the same time."
            )

        if len(apps) > 0 and len(tags) == 0 and not allow_all:
            warnings.warn(
                "Using all the actions of an app is not recommended. "
                "Please use tags to filter actions or provide specific actions. "
                "We just pass the important actions to the agent, but this is not meant "
                "to be used in production. Check out https://docs.composio.dev/sdk/python/actions for more information.",
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
            if len(apps) != 1:
                raise ComposioClientError(
                    "Error retrieving Actions, Use case "
                    "should be provided with exactly one app."
                )
            queries["useCase"] = use_case

        if len(apps) > 0:
            queries["appNames"] = ",".join(
                list(map(lambda x: t.cast(App, x).slug, apps))
            )

        if len(actions) > 0:
            queries["appNames"] = ",".join(
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
            required = [t.cast(Action, action).name for action in actions]
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

    def execute(
        self,
        action: Action,
        params: t.Dict,
        entity_id: str = "default",
        connected_account: t.Optional[str] = None,
        text: t.Optional[str] = None,
    ) -> t.Dict:
        """
        Execute an action on the specified entity with optional connected account.

        :param action: The Action object to be executed.
        :param params: A dictionary of parameters to be passed to the action.
        :param entity_id: The unique identifier of the entity on which the action is executed.
        :param connected_account: Optional connected account ID if required for the action.
        :return: A dictionary containing the response from the executed action.
        """
        if action.is_local:
            return self.client.local.execute_action(action=action, request_data=params)

        actions = self.get(actions=[action])
        if len(actions) == 0:
            raise ComposioClientError(f"Action {action} not found")

        (action_model,) = actions
        action_req_schema = action_model.parameters.properties
        modified_params: t.Dict[str, t.Union[str, t.Dict[str, str]]] = {}
        for param, value in params.items():
            request_param_schema = action_req_schema[param]
            file_readable = request_param_schema.get("file_readable", False)
            file_uploadable = _check_file_uploadable(request_param_schema)

            if file_readable and isinstance(value, str) and os.path.isfile(value):
                with open(value, "rb") as file:
                    file_content = file.read()
                    try:
                        modified_params[param] = file_content.decode("utf-8")
                    except UnicodeDecodeError:
                        # If decoding fails, treat as binary and encode in base64
                        modified_params[param] = base64.b64encode(file_content).decode(
                            "utf-8"
                        )
            elif file_uploadable and isinstance(value, str):
                if not os.path.isfile(value):
                    raise ValueError(f"Attachment File with path `{value}` not found.")

                with open(value, "rb") as file:
                    file_content = file.read()

                modified_params[param] = {
                    "name": os.path.basename(value),
                    "content": base64.b64encode(file_content).decode("utf-8"),
                }
            else:
                modified_params[param] = value

        if action.no_auth:
            return self._raise_if_required(
                self.client.http.post(
                    url=str(self.endpoint / action.name / "execute"),
                    json={
                        "appName": action.app,
                        "input": modified_params,
                        "entityId": entity_id,
                        "text": text,
                    },
                )
            ).json()

        if connected_account is None:
            raise ComposioClientError(
                "`connected_account` cannot be `None` when executing "
                "an app which requires authentication"
            )

        return self._raise_if_required(
            self.client.http.post(
                url=str(self.endpoint / action.name / "execute"),
                json={
                    "connectedAccountId": connected_account,
                    "input": modified_params,
                    "entityId": entity_id,
                    "text": text,
                },
            )
        ).json()


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
    _count: t.Dict
    appName: str

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
        auth_mode: t.Optional[str] = None,
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
