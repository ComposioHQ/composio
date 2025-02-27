"""
Composio SDK client.
"""

import os
import sys
import typing as t
from datetime import datetime

import requests

from composio.client.collections import (
    AUTH_SCHEME_WITH_INITIATE,
    Actions,
    ActiveTriggerModel,
    ActiveTriggers,
    Apps,
    AuthSchemeType,
    ConnectedAccountModel,
    ConnectedAccounts,
    ConnectionRequestModel,
    CustomAuthObject,
    IntegrationModel,
    Integrations,
    Logs,
    Triggers,
)
from composio.client.endpoints import v1
from composio.client.enums import (
    Action,
    App,
    AppType,
    Tag,
    TagType,
    Trigger,
    TriggerType,
)
from composio.client.exceptions import ComposioClientError, HTTPError, NoItemsFound
from composio.client.http import HttpClient
from composio.constants import (
    DEFAULT_ENTITY_ID,
    ENV_COMPOSIO_API_KEY,
    LOCAL_CACHE_DIRECTORY,
    USER_DATA_FILE_NAME,
)
from composio.exceptions import ApiKeyError, ApiKeyNotProvidedError, InvalidParams
from composio.storage.user import UserData
from composio.utils.decorators import deprecated
from composio.utils.shared import generate_request_id
from composio.utils.url import get_api_url_base


_valid_keys: t.Set[str] = set()
_clients: t.List["Composio"] = []


class Composio:
    """Composio SDK Client."""

    local: t.Any
    _api_key: t.Optional[str] = None
    _http: t.Optional[HttpClient] = None
    _long_timeout_http: t.Optional[HttpClient] = None

    def __init__(
        self,
        api_key: t.Optional[str] = None,
        base_url: t.Optional[str] = None,
        runtime: t.Optional[str] = None,
    ) -> None:
        """
        Initialize Composio SDK client

        :param api_key: Authentication key for Composio server
        :param base_url: Base URL for Composio server
        :param runtime: Runtime specifier
        """
        self._api_key = api_key
        self.runtime = runtime
        self.base_url = base_url or get_api_url_base()

        self.apps = Apps(client=self)
        self.actions = Actions(client=self)
        self.triggers = Triggers(client=self)
        self.integrations = Integrations(client=self)
        self.active_triggers = ActiveTriggers(client=self)
        self.connected_accounts = ConnectedAccounts(client=self)
        self.logs = Logs(client=self)
        _clients.append(self)

    @staticmethod
    def get_latest() -> "Composio":
        """Get latest composio client from the runtime stack."""
        if len(_clients) == 0:
            _ = Composio()
        return _clients[-1]

    @property
    def api_key(self) -> str:
        if self._api_key is None:
            user_data_path = LOCAL_CACHE_DIRECTORY / USER_DATA_FILE_NAME
            user_data = (
                UserData.load(path=user_data_path) if user_data_path.exists() else None
            )
            env_api_key = (
                user_data.api_key
                if user_data is not None and user_data.api_key is not None
                else os.environ.get(ENV_COMPOSIO_API_KEY)
            )
            if env_api_key:
                self._api_key = env_api_key

        if self._api_key is None:
            raise ApiKeyNotProvidedError

        self._api_key = self.validate_api_key(
            key=t.cast(str, self._api_key),
            base_url=self.base_url,
        )

        return self._api_key

    @api_key.setter
    def api_key(self, value: str) -> None:
        self._api_key = value

    @property
    def http(self) -> HttpClient:
        if not self._http:
            self._http = HttpClient(
                base_url=self.base_url,
                api_key=self.api_key,
                runtime=self.runtime,
            )
        return self._http

    @http.setter
    def http(self, value: HttpClient) -> None:
        self._http = value

    @property
    def long_timeout_http(self) -> HttpClient:
        if not self._long_timeout_http:
            self._long_timeout_http = HttpClient(
                base_url=self.base_url,
                api_key=self.api_key,
                runtime=self.runtime,
                timeout=180.0,
            )
        return self._long_timeout_http

    @long_timeout_http.setter
    def long_timeout_http(self, value: HttpClient) -> None:
        self._long_timeout_http = value

    @staticmethod
    def validate_api_key(key: str, base_url: t.Optional[str] = None) -> str:
        """Validate given API key."""
        if key in _valid_keys:
            return key

        base_url = base_url or get_api_url_base()
        response = requests.get(
            url=base_url + str(v1 / "client" / "auth" / "client_info"),
            headers={
                "x-api-key": key,
                "x-request-id": generate_request_id(),
            },
            timeout=60,
        )
        if response.status_code in (401, 403):
            raise ApiKeyError("API Key is not valid!")

        if response.status_code != 200:
            raise ApiKeyError(f"Unexpected error: HTTP {response.status_code}")

        _valid_keys.add(key)
        return key

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

    @deprecated(version="0.5.52", replacement="execute_action")
    def execute(
        self,
        action: Action,
        params: t.Dict,
        connected_account_id: t.Optional[str] = None,
        session_id: t.Optional[str] = None,
        text: t.Optional[str] = None,
        auth: t.Optional[CustomAuthObject] = None,
    ) -> t.Dict:
        """
        Execute an action.

        :param action: Action ID (Enum)
        :param params: Parameters for executing actions
        :param connected_account_id: Connection ID if you want to use a specific
                connection
        :param session_id: ID of the current workspace session
        :return: Dictionary containing execution result
        """
        return self._execute(
            action, params, connected_account_id, session_id, text, auth
        )

    def _execute(
        self,
        action: Action,
        params: t.Dict,
        connected_account_id: t.Optional[str] = None,
        session_id: t.Optional[str] = None,
        text: t.Optional[str] = None,
        auth: t.Optional[CustomAuthObject] = None,
        allow_tracing: bool = False,
    ) -> t.Dict:
        if action.no_auth:
            return self.client.actions.execute(
                action=action,
                params=params,
                entity_id=self.id,
                session_id=session_id,
                text=text,
                allow_tracing=allow_tracing,
            )

        if auth is not None:
            return self.client.actions.execute(
                action=action,
                params=params,
                entity_id=self.id,
                session_id=session_id,
                text=text,
                auth=auth,
                allow_tracing=allow_tracing,
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
            session_id=session_id,
            text=text,
            auth=auth,
            allow_tracing=allow_tracing,
        )

    def get_connection(
        self,
        app: t.Optional[AppType] = None,
        connected_account_id: t.Optional[str] = None,
    ) -> ConnectedAccountModel:
        """
        Get connected account for an action.

        :param app: App name
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
        app = str(app).lower()
        for connected_account in connected_accounts:
            if app == connected_account.appUniqueId:
                creation_date = datetime.fromisoformat(
                    connected_account.createdAt.replace("Z", "+00:00")
                )
                if latest_account is None or creation_date < latest_creation_date:
                    latest_creation_date = creation_date
                    latest_account = connected_account

        if latest_account is None:
            entity = self.id
            suggestion = (
                f"composio add {app}"
                if entity == DEFAULT_ENTITY_ID
                else f"composio add {app} -e {entity}"
            )
            note = f"Run this command to create a new connection: {suggestion}"
            doc_note = "Read more here: https://dub.composio.dev/auth-help"
            if sys.version_info >= (3, 11):
                exception = NoItemsFound(
                    f"Could not find a connection with {app=},"
                    f" {connected_account_id=} and {entity=}."
                )
                exception.add_note(note)
                exception.add_note(doc_note)
            else:
                exception = NoItemsFound(
                    f"Could not find a connection with {app=},"
                    f" {connected_account_id=} and {entity=}.\n{note}\n{doc_note}"
                )
            raise exception

        return latest_account

    def get_connections(self) -> t.List[ConnectedAccountModel]:
        """
        Get all connections for an entity.
        """
        return self.client.connected_accounts.get(entity_ids=[self.id], active=True)

    def enable_trigger(
        self, app: t.Union[str, App], trigger_name: str, config: t.Dict[str, t.Any]
    ) -> t.Dict:
        """
        Enable a trigger for an entity.

        :param app: App name
        :param trigger_name: Trigger name
        :param config: Trigger config
        """
        connected_account = self.get_connection(app=app)
        return self.client.triggers.enable(
            name=trigger_name,
            connected_account_id=connected_account.id,
            config=config,
        )

    def disable_trigger(self, trigger_id: str) -> t.Dict:
        """
        Disable a trigger for an entity.

        :param trigger_id: Trigger ID
        """
        return self.client.triggers.disable(id=trigger_id)

    def get_active_triggers(self) -> t.List[ActiveTriggerModel]:
        """
        Get all active triggers for an entity.
        """
        connected_accounts = self.get_connections()
        return self.client.active_triggers.get(
            connected_account_ids=[
                connected_account.id for connected_account in connected_accounts
            ]
        )

    def initiate_connection(
        self,
        # TODO: Rename this parameter to 'app'
        app_name: t.Union[str, App],
        auth_mode: t.Optional[str] = None,
        auth_config: t.Optional[t.Dict[str, t.Any]] = None,
        redirect_url: t.Optional[str] = None,
        integration: t.Optional[IntegrationModel] = None,
        use_composio_auth: bool = True,
        force_new_integration: bool = False,
        connected_account_params: t.Optional[t.Dict] = None,
        labels: t.Optional[t.List] = None,
    ) -> ConnectionRequestModel:
        """
        Initiate an integration connection process for a specified application.

        :param app_name: The name of the application or an App enum instance.
        :param auth_mode: Optional authentication mode to be used.
        :param auth_config: Optional dictionary containing authentication configuration details.
        :param redirect_url: Optional URL to which a user will be redirected after authentication.
        :param integration: Optional existing IntegrationModel instance to be used.
        :return: A ConnectionRequestModel instance representing the initiated connection.
        """
        app = self.client.apps.get(name=App(app_name).slug)
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        if integration is None and auth_mode is not None:
            if auth_mode not in AUTH_SCHEME_WITH_INITIATE:
                raise InvalidParams(
                    f"'auth_mode' should be one of {AUTH_SCHEME_WITH_INITIATE}"
                )

            auth_mode = t.cast(AuthSchemeType, auth_mode)
            if "OAUTH" not in auth_mode:
                use_composio_auth = False

            integration = self.client.integrations.create(
                app_id=app.appId,
                name=f"{app_name}_{timestamp}",
                auth_mode=auth_mode,
                auth_config=auth_config,
                use_composio_auth=use_composio_auth,
                force_new_integration=force_new_integration,
            )

        if integration is None and auth_mode is None:
            integration = self.client.integrations.create(
                app_id=app.appId,
                auth_config=auth_config,
                name=f"{app_name}_{timestamp}",
                use_composio_auth=use_composio_auth,
                force_new_integration=force_new_integration,
            )

        return self.client.connected_accounts.initiate(
            integration_id=t.cast(IntegrationModel, integration).id,
            entity_id=self.id,
            params=connected_account_params,
            labels=labels,
            redirect_url=redirect_url,
        )


__all__ = (
    "Action",
    "App",
    "Tag",
    "AppType",
    "TagType",
    "Trigger",
    "TriggerType",
    "Composio",
)
