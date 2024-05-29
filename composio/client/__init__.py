"""
Composio SDK client.
"""

import os
import time
import typing as t
import warnings
from datetime import datetime

import requests
from pydantic import BaseModel, ConfigDict

from composio.client.endpoints import Endpoint, v1
from composio.client.enums import (  # TODO: Fix pseudo-circular dependendcy
    Action,
    App,
    Tag,
)
from composio.client.exceptions import ComposioClientError, HTTPError, NoItemsFound
from composio.client.http import HttpClient
from composio.constants import DEFAULT_ENTITY_ID, ENV_COMPOSIO_API_KEY
from composio.exceptions import raise_api_key_missing
from composio.utils.url import get_api_url_base

from .local_handler import LocalToolHandler


ModelType = t.TypeVar("ModelType")
CollectionType = t.TypeVar("CollectionType", list, dict)


class Collection(t.Generic[ModelType]):
    """Data model collection for representing server objects."""

    endpoint: Endpoint
    model: t.Type[ModelType]

    _list_key: str = "items"

    def __init__(self, client: "Composio") -> None:
        """Initialize conntected accounts models namespace."""
        self.client = client

    def _raise_if_required(
        self,
        response: requests.Response,
        status_code: int = 200,
    ) -> requests.Response:
        """
        Raise if HTTP response is not expected.

        :param response: Http response
        :param status_code: Expected status code
        :raises composio.client.exceptions.HTTPError: If the status code does
                not match with the expected status code
        """
        if response.status_code != status_code:
            raise HTTPError(
                message=response.content.decode(encoding="utf-8"),
                status_code=response.status_code,
            )
        return response

    def _raise_if_empty(self, collection: CollectionType) -> CollectionType:
        """Raise if provided colleciton is empty."""
        if len(collection) > 0:
            return collection
        raise NoItemsFound(message="No items found")

    def get(self, queries: t.Optional[t.Dict[str, str]] = None) -> t.List[ModelType]:
        """List available models."""
        request = self._raise_if_required(
            response=self.client.http.get(
                url=str(self.endpoint(queries=queries or {})),
            ),
        )

        data = request.json()
        if isinstance(data, list):
            return [self.model(**item) for item in data]

        if self._list_key in data:
            return [self.model(**item) for item in data[self._list_key]]

        raise HTTPError(
            message=f"Received invalid data object: {request.content.decode()}",
            status_code=request.status_code,
        )


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

    model_config: ConfigDict = ConfigDict(  # type: ignore
        arbitrary_types_allowed=True,
    )
    sdk: t.Optional["Composio"] = None


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
        connected_account = client.connected_accounts.get(
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
        timeout=60,
    ) -> "ConnectedAccountModel":
        start_time = time.time()
        while time.time() - start_time < timeout:
            connection = client.connected_accounts.get(
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
    displayName: str
    description: str
    type: str

    required: bool = False
    expected_from_customer: bool = False


class AppAuthScheme(BaseModel):
    """App authenticatio scheme."""

    scheme_name: str
    auth_mode: str
    proxy: t.Dict
    fields: t.List[AuthSchemeField]

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
    logo: str
    appId: str
    description: str
    categories: t.List[str]
    meta: t.Dict

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


class TriggerPayloadPropertyModel(BaseModel):
    """Trigger payload property data model."""

    description: str
    title: str
    type: str

    examples: t.Optional[t.List] = None


class TriggerPayloadModel(BaseModel):
    """Trigger payload data model."""

    properties: t.Dict[str, TriggerPayloadPropertyModel]
    title: str
    type: str

    required: t.Optional[t.List[str]] = None


class TriggerConfigPropertyModel(BaseModel):
    """Trigger config property data model."""

    description: str
    title: str
    type: str


class TriggerConfigModel(BaseModel):
    """Trigger config data model."""

    properties: t.Dict[str, TriggerConfigPropertyModel]
    title: str
    type: str

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
    logo: str
    appName: str
    count: int
    enabled: bool


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
        trigger_ids: t.Optional[t.List[str]] = None,
        app_names: t.Optional[t.List[str]] = None,
    ) -> t.List[TriggerModel]:
        """
        List active triggers

        :param trigger_ids: Trigger IDs to filter by
        :param app_names: App names to filter by
        :return: List of triggers filtered by provded parameters
        """
        queries = {}
        if trigger_ids is not None and len(trigger_ids) > 0:
            queries["triggerIds"] = ",".join(trigger_ids)
        if app_names is not None and len(app_names) > 0:
            queries["appNames"] = ",".join(app_names)
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
            self.client.http.post(
                url=str(self.endpoint.disable / id),
            )
        )
        return response.json()


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
    ) -> t.List[ActiveTriggerModel]:
        """List active triggers."""
        trigger_ids = trigger_ids or []
        return self._raise_if_empty(
            super().get(
                queries=(
                    {"triggerIds": ",".join(trigger_ids)}
                    if len(trigger_ids) > 0
                    else {}
                )
            )
        )


class ActionParameterPropertyModel(BaseModel):
    """Action parameter data model."""

    examples: t.Optional[t.List] = None
    description: t.Optional[str] = None
    title: t.Optional[str] = None
    type: t.Optional[str] = None


class ActionParametersModel(BaseModel):
    """Action parameter data models."""

    properties: t.Dict[str, ActionParameterPropertyModel]
    title: str
    type: str

    required: t.Optional[t.List[str]] = None


class ActionResponsePropertyModel(BaseModel):
    """Action response data model."""

    description: t.Optional[str] = None
    examples: t.Optional[t.List] = None
    title: t.Optional[str] = None
    type: t.Optional[str] = None


class ActionResponseModel(BaseModel):
    """Action response data model."""

    properties: t.Dict[str, ActionResponsePropertyModel]
    title: str
    type: str

    required: t.Optional[t.List[str]] = None


class ActionModel(BaseModel):
    """Action data model."""

    name: str
    display_name: str
    description: t.Optional[str]
    parameters: ActionParametersModel
    response: ActionResponseModel
    appKey: str
    appId: str
    logo: str
    tags: t.List[str]
    appName: str
    enabled: bool


class Actions(Collection[ActionModel]):
    """Collection of composio actions.."""

    model = ActionModel
    endpoint = v1.actions
    local_handler = LocalToolHandler()

    # TODO: Overload
    def get(  # type: ignore
        self,
        actions: t.Optional[t.Sequence[Action]] = None,
        apps: t.Optional[t.Sequence[App]] = None,
        tags: t.Optional[t.Sequence[t.Union[str, Tag]]] = None,
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
        actions = actions or []
        apps = apps or []
        tags = tags or []
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
            local_items = self.local_handler.get_list_of_action_schemas(
                apps=local_apps, actions=local_actions, tags=tags
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
            queries["appNames"] = ",".join(list(map(lambda x: x.value, apps)))

        if len(actions) > 0:
            queries["appNames"] = ",".join(set(map(lambda x: x.app, actions)))

        if limit is not None:
            queries["limit"] = str(limit)
        response = self._raise_if_required(
            response=self.client.http.get(
                url=str(self.endpoint(queries=queries)),
            )
        )
        response_json = response.json()
        items = [self.model(**action) for action in response_json.get("items")]
        if len(actions) > 0:
            required_triggers = [action.action for action in actions]
            items = [item for item in items if item.name in required_triggers]

        if len(tags) > 0:
            required_triggers = [
                tag.app if isinstance(tag, Tag) else tag for tag in tags
            ]
            items = [
                item
                for item in items
                if any(tag in required_triggers for tag in item.tags)
            ]

        if len(local_apps) > 0 or len(local_actions) > 0:
            local_items = self.local_handler.get_list_of_action_schemas(
                apps=local_apps, actions=local_actions, tags=tags
            )
            items = [self.model(**item) for item in local_items] + items
        return items

    def execute(
        self,
        action: Action,
        params: t.Dict,
        entity_id: str,
        connected_account: t.Optional[str] = None,
    ) -> t.Dict:
        """Execute an action."""
        if action.is_local:
            return self.local_handler.execute_local_action(
                action=action,
                request_data=params,
            )
        if action.no_auth:
            return self._raise_if_required(
                self.client.http.post(
                    url=str(self.endpoint / action.action / "execute"),
                    json={
                        "appName": action.app,
                        "input": params,
                        "entityId": entity_id,
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
                url=str(self.endpoint / action.action / "execute"),
                json={
                    "connectedAccountId": connected_account,
                    "input": params,
                    "entityId": entity_id,
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
    logo: str

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
        auth_schemes: t.Optional[t.List[AppAuthScheme]] = None,
        use_composio_auth: bool = False,
    ) -> IntegrationModel:
        """
        Create a new integration

        :param app_id: App ID string.
        :param name: Name of the integration.
        :param auth_param: Auth mode string.
        :param auth_schemes: Auth schemes supported by the app.
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
            for auth_scheme in auth_schemes or []:
                if auth_scheme.auth_mode == auth_mode:
                    request["authConfig"] = {
                        field.name: "" for field in auth_scheme.fields
                    }
        response = self._raise_if_required(
            response=self.client.http.post(
                url=str(self.endpoint),
                json=request,
            )
        )
        return IntegrationModel(**response.json())


class Composio:
    """Composio SDK Client."""

    def __init__(
        self,
        api_key: t.Optional[str] = None,
        base_url: t.Optional[str] = None,
    ) -> None:
        """
        Initialize Composio SDK client

        :param api_key: Authentication key for Composio server
        :param base_url: Base URL for Composio server
        """
        api_key = api_key or os.environ.get(ENV_COMPOSIO_API_KEY)
        if api_key is None:
            raise_api_key_missing()

        self.base_url = base_url or get_api_url_base()
        self.api_key = t.cast(str, api_key)
        self.http = HttpClient(
            base_url=self.base_url,
            api_key=self.api_key,
        )

        self.connected_accounts = ConnectedAccounts(client=self)
        self.apps = Apps(client=self)
        self.actions = Actions(client=self)
        self.triggers = Triggers(client=self)
        self.integrations = Integrations(client=self)
        self.active_triggers = ActiveTriggers(client=self)

    @staticmethod
    def generate_auth_key(base_url: t.Optional[str] = None) -> str:
        """Generate auth key."""
        http = HttpClient(
            base_url=base_url or get_api_url_base(),
            api_key="",
        )
        response = http.get(url=str(v1.cli.generate_cli_session))
        if response.status_code != 200:
            raise HTTPError(
                message=response.content.decode(),
                status_code=response.status_code,
            )
        data = response.json()
        return data["key"]

    @staticmethod
    def validate_auth_session(
        key: str,
        code: str,
        base_url: t.Optional[str] = None,
    ) -> str:
        """
        Validate API session.

        :param key: Session key
        :param code: Authentication code
        """
        http = HttpClient(
            base_url=base_url or get_api_url_base(),
            api_key="",
        )
        response = http.get(str(v1.cli.verify_cli_code({"key": key, "code": code})))
        if response.status_code != 200:
            raise HTTPError(
                message=response.content.decode(),
                status_code=response.status_code,
            )
        data = response.json()
        return data["apiKey"]

    def get_entity(self, id: str = DEFAULT_ENTITY_ID) -> "Entity":
        """
        Create Entity object.

        :param id: Entity ID
        :return: Entity object.
        """
        return Entity(id=id, client=self)


class Entity:
    """Class to represent Entity object."""

    def __init__(
        self,
        client: Composio,
        id: str = DEFAULT_ENTITY_ID,
    ) -> None:
        """
        Initialize Entity object.

        :param client: Composio client object.
        :param id: Entity ID string
        """
        self.client = client
        self.id = id

    def execute(
        self,
        action: Action,
        params: t.Dict,
        connected_account_id: t.Optional[str] = None,
    ) -> t.Dict:
        """
        Execute an action.

        :param action: Action ID (Enum)
        :param params: Parameters for executing actions
        :param connected_account_id: Connection ID if you want to use a specific
                connection
        :return: Dictionary containing execution result
        """
        if action.no_auth:
            return self.client.actions.execute(
                action=action,
                params=params,
                entity_id=self.id,
            )

        connected_account = self.get_connection(
            app=action.app,
            connected_account_id=connected_account_id,
        )
        return self.client.actions.execute(
            action=action,
            params=params,
            entity_id=t.cast(str, connected_account.clientUniqueUserId),
            connected_account=connected_account.id,
        )

    def get_connection(
        self,
        app: t.Optional[str] = None,
        connected_account_id: t.Optional[str] = None,
    ) -> ConnectedAccountModel:
        """
        Get connected account for an action.

        :param action: Action type enum
        :param connected_account_id: Connected account ID to use as filter
        :return: Connected account object
        :raises: If no connected account found for given entity ID
        """
        if connected_account_id is not None:
            return self.client.connected_accounts.get(
                connection_id=connected_account_id
            )

        latest_account = None
        latest_creation_date = datetime.fromtimestamp(0.0)
        connected_accounts = self.client.connected_accounts.get(
            entity_ids=[self.id],
            active=True,
        )
        for connected_account in connected_accounts:
            if app == connected_account.appUniqueId:
                creation_date = datetime.fromisoformat(
                    connected_account.createdAt.replace("Z", "+00:00")
                )
                if latest_account is None or creation_date > latest_creation_date:
                    latest_creation_date = creation_date
                    latest_account = connected_account
        if latest_account is None:
            raise ComposioClientError(
                f"Could not find a connection with app='{app}',"
                f"connected_account_id=`{connected_account_id}` and "
                f"entity=`{self.id}`"
            )
        return latest_account

    def initiate_connection(
        self,
        app_name: t.Union[str, App],
        redirect_url: t.Optional[str] = None,
        integration: t.Optional[IntegrationModel] = None,
        auth_mode: t.Optional[str] = None,
    ) -> ConnectionRequestModel:
        """Initiate integration connection."""
        if isinstance(app_name, App):
            app_name = app_name.value

        if auth_mode is None:
            integration = integration or self.client.integrations.create(
                app_id=app_name,
                use_composio_auth=True,
            )
            return self.client.connected_accounts.initiate(
                integration_id=integration.id,
                entity_id=self.id,
                redirect_url=redirect_url,
            )

        app = self.client.apps.get(name=app_name)
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        integration = integration or self.client.integrations.create(
            app_id=app.appId,
            name=f"integration_{timestamp}",
            auth_mode=auth_mode,
            auth_schemes=app.auth_schemes,
        )
        return self.client.connected_accounts.initiate(
            integration_id=integration.id,
            entity_id=self.id,
            redirect_url=redirect_url,
        )
