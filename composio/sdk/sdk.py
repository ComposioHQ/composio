from typing import Optional
from composio.sdk.api.repo import get_app, get_integration, get_list_active_triggers, get_list_of_integrations, get_list_triggers, post_set_global_trigger
from composio.sdk.entities import Entity
from composio.sdk.entities.connectedAccount import ConnectedAccount
from composio.sdk.entities.integration import Integration
from composio.sdk.entities.trigger import Trigger
from composio.sdk.enums import App
from composio.sdk.http_client import HttpClient
from composio.sdk.storage import get_base_url
from composio.sdk.entities.activeTrigger import ActiveTrigger
from composio.sdk.exceptions import BadErrorException, NotFoundException
from composio.sdk.utils import build_query_params, build_query_url
from composio.sdk.types.integrations_list import ListIntegrationItemModel, ListIntegrationsModel

class Composio:
    """The Composio SDK class.
    """
    def __init__(self, api_key: str, base_url=get_base_url()):
        """
            Initialize a Composio client with the given API key and base URL.

            :param str api_key: The API key to use for authentication.
            :param Optional[str] base_url: The base URL to use for API requests. Defaults to the default Composio base URL.
        """
        self.base_url = base_url
        self.api_key = api_key
        self.http_client = HttpClient(base_url)
        self.http_client.headers.update(
            {"Content-Type": "application/json", "x-api-key": self.api_key}
        )

    # <--- Triggers --->
    def list_triggers(self, app_names: Optional[list[App]] = None, trigger_ids: Optional[list[str]] = None) -> list[Trigger]:
        """Get all triggers for a given app.

        :param Optional[list[App]] app_names: The names of the apps to get triggers for. If not provided, all triggers will be returned.
        :param Optional[list[str]] trigger_ids: The IDs of the triggers to get. If not provided, all triggers will be returned.

        :return: A list of Trigger objects representing the triggers for the specified apps.
        :rtype: list[Trigger]
        """
        triggers = get_list_triggers(self.base_url, self.api_key, app_names)
        return [Trigger(self, **item) for item in triggers["items"]]

    def list_active_triggers(self, trigger_ids: Optional[list[str]] = None) -> list[ActiveTrigger]:
        """
            Get all active triggers for a given app.
            
            :param Optional[list[str]] trigger_ids: The IDs of the triggers to get active triggers for. If not provided, all active triggers will be returned.
            :rtype: list[ActiveTrigger]
        """
        active_triggers = get_list_active_triggers(self.base_url, self.api_key, trigger_ids)
        return [ActiveTrigger(self, **item) for item in active_triggers["items"]]
    
    def get_trigger(self, trigger_id: str) -> Trigger:
        """Get a specific trigger by its ID.

            :param str trigger_id: The ID of the trigger to get.
            :return: A Trigger object representing the specified trigger.
            :rtype: Trigger
        """
        triggers = self.list_triggers(trigger_ids=[trigger_id])
        if len(triggers) == 0:
            raise NotFoundException(f"Trigger with ID {trigger_id} not found.")
        trigger = triggers[0]

        return trigger
    
    def set_global_trigger_callback_url(self, callback_url: str):
        """Set the global trigger callback URL.
            
            :param str callback_url: The URL to set as the global trigger callback URL.
        """
        return post_set_global_trigger(self.base_url, self.api_key, callback_url)
    
    # # <--- Connected Accounts --->

    def list_connected_accounts(
        self, entity_id: Optional[str] = None, showActiveOnly: Optional[bool] = None 
    ) -> list[ConnectedAccount]:
        """
            Get connected accounts for a given entity.

            :param Optional[str] entity_id: The ID of the entity to get connected accounts for. If not provided, all connected accounts will be returned.
            :param Optional[bool] showActiveOnly: Whether to show only active accounts. Defaults to None.
            :return: A list of ConnectedAccount objects.
            :rtype: list[ConnectedAccount]
        """
        
        query_params = build_query_params(entity_id=entity_id, showActiveOnly=showActiveOnly)
        url = build_query_url("v1/connectedAccounts", query_params)

        resp = self.http_client.get(url)
        return [ConnectedAccount(self, **item) for item in resp.json()["items"]]
    
    def get_connected_account(self, connection_id: str) -> ConnectedAccount:
        """
            Get a specific connected account by its ID.
            
            :param str connection_id: The ID of the connected account to get.
            :return: A ConnectedAccount object representing the specified connected account.
            :rtype: ConnectedAccount
        """
        resp = self.http_client.get(f"v1/connectedAccounts/{connection_id}")
        return ConnectedAccount(self, **resp.json())
    
    # # <--- Integrations --->
    def list_integrations(self) -> ListIntegrationsModel:
        """
            Get all integrations for the account.

            :return: A list of Integration objects representing the integrations for the account.
            :rtype: ListIntegrationsModel
        """
        return get_list_of_integrations(self.base_url, self.api_key)
    
    def get_integration(self, connector_id: str) -> ListIntegrationItemModel:
        """
            Get an integration by its ID.

            :param str connector_id: The ID of the integration to get.
            :return: An Integration object representing the specified integration.
            :rtype: ListIntegrationItemModel
        """
        return get_integration(self.base_url, self.api_key, connector_id)

    def create_integration(self, app: App, name: str, auth_mode: str, use_default_credentials: bool = False) -> Integration:
        """
            Create an integration for a given app.

            :param App app: The app for which the integration is being created.
            :param str name: The name of the integration.
            :param str auth_mode: The authentication mode for the integration.
            :param Optional[bool] use_default_credentials: Whether to use default credentials for the integration. Defaults to False.
            :return: An Integration object representing the created integration.
            :rtype: Integration
        """
        app_details = get_app(self.base_url, self.api_key, app.value)
        app_id = app_details.appId
        if app_id is None:
            raise NotFoundException(f"App {app} does not exist for the account")
        
        req = {"appId": app_id, "useComposioAuth": use_default_credentials}
        if name:
            req["name"] = name
        if auth_mode:
            req["authScheme"] = auth_mode
            auth_schemes = app_details.auth_schemes
            if auth_schemes is None:
                raise BadErrorException(f"Auth schemes not found for app {app}.")
            for auth_scheme_iter in auth_schemes:
                if auth_scheme_iter.auth_mode == auth_mode:
                    fields = auth_scheme_iter.fields
                    req["authConfig"] = {field.name: "" for field in fields}
        resp = self.http_client.post("v1/integrations", json=req)
        return Integration(self, **resp.json())
    
    def Entity(self, entity_id: str) -> Entity:
        """
            Get an entity by its ID.
            
            :param str entity_id: The ID of the entity to get.
            :return: An Entity object representing the specified entity.
            :rtype: Entity
        """
        return Entity(sdk_instance=self, entity_id=entity_id)