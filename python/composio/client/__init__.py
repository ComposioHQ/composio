# fmt: off

"""
Composio SDK client.
"""

import os
import typing as t
from datetime import datetime

from composio.client.base import BaseClient
from composio.client.collections import (
    Actions,
    ActiveTriggerModel,
    ActiveTriggers,
    Apps,
    ConnectedAccountModel,
    ConnectedAccounts,
    ConnectionRequestModel,
    IntegrationModel,
    Integrations,
    Triggers,
)
from composio.client.endpoints import v1
from composio.client.enums import Action, App
from composio.client.exceptions import ComposioClientError, HTTPError
from composio.client.http import HttpClient
from composio.constants import DEFAULT_ENTITY_ID, ENV_COMPOSIO_API_KEY
from composio.exceptions import raise_api_key_missing
from composio.utils.url import get_api_url_base


class Composio(BaseClient):
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
        text: t.Optional[str] = None,
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
                text=text,
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
            text=text,
        )

    def get_connection(
        self,
        app: t.Optional[t.Union[str, App]] = None,
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
        app_name: t.Union[str, App],
        auth_mode: t.Optional[str] = None,
        auth_config: t.Optional[t.Dict[str, t.Any]] = None,
        redirect_url: t.Optional[str] = None,
        integration: t.Optional[IntegrationModel] = None,
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
        if isinstance(app_name, App):
            app_name = app_name.value

        app = self.client.apps.get(name=app_name)
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        if integration is None and auth_mode is not None:
            integration = self.client.integrations.create(
                app_id=app.appId,
                name=f"integration_{timestamp}",
                auth_mode=auth_mode,
                auth_config=auth_config,
                use_composio_auth=False,
            )

        if integration is None and auth_mode is None:
            integration = self.client.integrations.create(
                app_id=app.appId,
                name=f"integration_{timestamp}",
                use_composio_auth=True,
            )

        return self.client.connected_accounts.initiate(
            integration_id=t.cast(IntegrationModel, integration).id,
            entity_id=self.id,
            redirect_url=redirect_url,
        )
