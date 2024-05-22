"""
Composio SDK client.
"""

import os
import typing as t

import requests
from pydantic import BaseModel, ConfigDict

from composio.client.endpoints import Endpoint, v1
from composio.client.exceptions import ComposioClientError, HTTPError
from composio.client.http import HttpClient
from composio.constants import ENV_COMPOSIO_API_KEY
from composio.sdk.enums import Action as ActionEnum
from composio.sdk.storage import get_base_url


ModelType = t.TypeVar("ModelType")


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
            raise RuntimeError("Please provide API key")

        self.base_url = base_url or get_base_url()
        self.api_key = api_key
        self.http = HttpClient(
            base_url=self.base_url,
            api_key=self.api_key,
        )

        self.connected_accounts = ConnectedAccounts(client=self)
        self.apps = Apps(client=self)
        self.actions = Actions(client=self)
        self.triggers = Triggers(client=self)
        self.active_triggers = ActiveTriggers(client=self)

    @staticmethod
    def generate_auth_key(base_url: t.Optional[str] = None) -> str:
        """Generate auth key."""
        http = HttpClient(
            base_url=base_url or get_base_url(),
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
            base_url=base_url or get_base_url(),
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

    def get_entity(self, id: str = "default") -> "Entity":
        """
        Create Entity object.

        :param id: Entity ID
        :return: Entity object.
        """
        return Entity(id=id, client=self)


class Entity:
    """Class to represent Entity object."""

    def __init__(self, id: str, client: Composio) -> None:
        """
        Initialize Entity object.

        :param client: Composio client object.
        :param id: Entity ID string
        """
        self.client = client
        self.id = id

    def execute(
        self,
        action: ActionEnum,
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
        return {}


class AuthConnectionParams(BaseModel):
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


class ConnectedAccount(BaseModel):
    """
    Connected account data model.
    """

    id: str
    status: str
    createdAt: str
    updatedAt: str
    appUniqueId: str
    integrationId: str
    connectionParams: AuthConnectionParams
    clientUniqueUserId: t.Optional[str] = None

    model_config: ConfigDict = ConfigDict(
        arbitrary_types_allowed=True,
    )
    sdk: t.Optional["Composio"] = None

    # TODO: Add actions


class ConnectedAccounts(Collection[ConnectedAccount]):
    """Collection of connected accounts."""

    model = ConnectedAccount
    endpoint = v1 / "connectedAccounts"

    @t.overload
    def get(self, connection_id: t.Optional[str] = None) -> ConnectedAccount:
        """
        Get an account by connection ID

        :param connection_id: ID of the connection to filter by
        :return: Connected account
        """

    @t.overload
    def get(self, *entity_ids: str, active: bool = False) -> t.List[ConnectedAccount]:
        """
        Get a list of connected accounts by entity IDs

        :param entity_ids: List of entity IDs to filter by
        :param active: Returns account which are currently active
        :return: List of connected accounts
        """

    def get(
        self,
        connection_id: t.Optional[str] = None,
        *entity_ids: str,
        active: bool = False,
    ) -> t.Union[ConnectedAccount, t.List[ConnectedAccount]]:
        """
        Get a list of connected accounts.

        :param entity_ids: List of entity IDs to filter by
        :param connection_id: Return the connected account by a specific
                connection ID
        :param active: Returns account which are currently active
        :return: List of connected accounts
        """
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


class App(BaseModel):
    """App data model."""

    key: str
    name: str
    description: str
    logo: str
    categories: t.List[str]
    appId: str
    enabled: bool
    meta: t.Dict


class Apps(Collection[App]):
    """Collection of composio apps.."""

    model = App
    endpoint = v1.apps


class TriggerPayloadProperty(BaseModel):
    """Trigger payload property data model."""

    description: str
    title: str
    type: str

    examples: t.Optional[t.List] = None


class TriggerPayload(BaseModel):
    """Trigger payload data model."""

    properties: t.Dict[str, TriggerPayloadProperty]
    title: str
    type: str

    required: t.Optional[t.List[str]] = None


class TriggerConfigProperty(BaseModel):
    """Trigger config property data model."""

    description: str
    title: str
    type: str


class TriggerConfig(BaseModel):
    """Trigger config data model."""

    properties: t.Dict[str, TriggerConfigProperty]
    title: str
    type: str

    required: t.Optional[t.List[str]] = None


class Trigger(BaseModel):
    """Trigger data model."""

    name: str
    display_name: str
    description: str
    payload: TriggerPayload
    config: TriggerConfig
    instructions: str
    appId: str
    appKey: str
    logo: str
    appName: str
    count: int
    enabled: bool


class Triggers(Collection[Trigger]):
    """Collection of triggers."""

    model = Trigger
    endpoint = v1.triggers

    def get(
        self,
        trigger_ids: t.Optional[t.List[str]] = None,
        app_names: t.Optional[t.List[str]] = None,
    ) -> t.List[Trigger]:
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

    def enable(self, name: str, connected_account_id: str) -> None:
        """
        Enable a trigger

        :param name: Name of the trigger
        :param connected_account_id: ID of the relevant connected account
        """
        response = self._raise_if_required(
            self.client.http.post(
                url=str(self.endpoint / name / connected_account_id), json={}
            )
        )

    def disable(self, id: str) -> None:
        """
        Disable a trigger

        :param name: Name of the trigger
        :param connected_account_id: ID of the relevant connected account
        """


class ActiveTrigger(BaseModel):
    """Active trigger data model."""

    id: str
    connectionId: str
    triggerName: str
    triggerConfig: dict


class ActiveTriggers(Collection[ActiveTrigger]):
    """Collection of active triggers."""

    model = ActiveTrigger
    endpoint = v1.triggers / "active_triggers"

    _list_key = "triggers"

    def get(self, trigger_ids: t.Optional[t.List[str]] = None) -> t.List[ActiveTrigger]:
        """List active triggers."""
        trigger_ids = trigger_ids or []
        return super().get(
            queries=(
                {"triggerIds": ",".join(trigger_ids)} if len(trigger_ids) > 0 else {}
            )
        )


class ActionParameterProperty(BaseModel):
    """Action parameter data model."""

    examples: t.Optional[t.List] = None
    description: t.Optional[str] = None
    title: t.Optional[str] = None
    type: t.Optional[str] = None


class ActionParameters(BaseModel):
    """Action parameter data models."""

    properties: t.Dict[str, ActionParameterProperty]
    title: str
    type: str

    required: t.Optional[t.List[str]] = None


class ActionResponseProperty(BaseModel):
    """Action response data model."""

    description: t.Optional[str] = None
    examples: t.Optional[t.List] = None
    title: t.Optional[str] = None
    type: t.Optional[str] = None


class ActionResponse(BaseModel):
    """Action response data model."""

    properties: t.Dict[str, ActionResponseProperty]
    title: str
    type: str

    required: t.Optional[t.List[str]] = None


class Action(BaseModel):
    """Action data model."""

    name: str
    display_name: str
    tags: t.List[str]
    description: str
    parameters: ActionParameters
    response: ActionResponse
    appId: str
    logo: str
    appName: str
    enabled: bool


class Actions(Collection[Action]):
    """Collection of active triggers."""

    model = Action
    endpoint = v1.actions

    def get(self) -> t.List[Action]:
        """List active triggers."""
        response = self._raise_if_required(
            response=self.client.http.get(
                url=str(self.endpoint),
            )
        )
        return [self.model(**action) for action in response.json().get("items")]
