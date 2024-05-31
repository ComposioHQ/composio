import os
from enum import Enum
from typing import Optional, Union

from composio.sdk.exceptions import BadErrorException, NotFoundException
from composio.sdk.http_client import HttpClient

from .enums import Action, App
from .sdk import Composio, ConnectedAccount, ConnectionRequest
from .storage import (
    get_api_key,
    get_base_url,
    load_user_data,
    save_user_data,
    set_base_url,
)
from .utils import get_git_user_info


class FrameworkEnum(Enum):
    AUTOGEN = "autogen"
    LANGCHAIN = "langchain"
    LYZR = "lyzr"
    CREWAI = "crewai"
    JULEP = "julep"
    OPENAI = "openai"
    CLAUDE = "claude"
    GRIPTAPE = "griptape"


__IS_FIRST_TIME__ = True


class ComposioCore:
    sdk: Composio = None
    framework: FrameworkEnum = None

    def __init__(
        self,
        base_url=get_base_url(),
        manage_auth=True,
        framework: FrameworkEnum = None,
        api_key: str = None,
    ):
        """
        Initialize the Composio SDK.

        Args:
            base_url (str, optional): The base URL for the Composio API. Defaults to the base URL stored in the user's data.
            manage_auth (bool, optional): Whether to manage authentication. Defaults to True.
            framework (FrameworkEnum, optional): The framework to use for the session. Defaults to None.
            api_key (str, optional): The API key to use for the session. Defaults to None.

        Returns:
            None
        """
        global __IS_FIRST_TIME__

        self.base_url = base_url
        self.manage_auth = manage_auth
        self.http_client = HttpClient(base_url)
        self.framework = framework
        self.http_client.headers.update({"Content-Type": "application/json"})

        if manage_auth:
            api_key_to_use = api_key if api_key else get_api_key()
            if api_key_to_use:
                self.http_client.headers.update(
                    {"Content-Type": "application/json", "x-api-key": api_key_to_use}
                )
                self.sdk = Composio(api_key=api_key_to_use, base_url=base_url)
                if framework is not None and __IS_FIRST_TIME__:
                    try:
                        git_info = get_git_user_info()
                        self.http_client.post(
                            "v1/client/auth/track",
                            json={
                                "framework": self.framework.value,
                                "user_git_user_info": (
                                    {
                                        "name": git_info.name,
                                        "email": git_info.email,
                                    }
                                    if git_info.name and git_info.email
                                    else None
                                ),
                            },
                        )
                        __IS_FIRST_TIME__ = False
                    except Exception as e:
                        print(e)

    def login(self, api_key: str):
        """
        Login to the Composio API.

        Args:
            api_key (str): The API key to use to login.

        Returns:
            None
        """
        self.http_client.headers.update(
            {"Content-Type": "application/json", "x-api-key": api_key}
        )
        self.sdk = Composio(api_key=api_key, base_url=self.base_url)

    def get_authenticated_user(self):
        """
        Retrieves the authenticated user.

        Returns:
            dict: The authenticated user.
        """
        composio_api_key = os.environ.get("COMPOSIO_API_KEY", None)
        api_key = composio_api_key if composio_api_key else get_api_key()
        return {
            "api_key": api_key,
        }

    def is_authenticated(self):
        """
        Check if the current session is authenticated.

        Returns:
            bool: True if the current session is authenticated, False otherwise.
        """
        if self.sdk is None:
            return False
        return True

    def set_base_url(self, base_url: str):
        """
        Set the base URL for the Composio API.

        Args:
            base_url (str): The base URL for the Composio API.

        Returns:
            None
        """
        self.base_url = base_url
        set_base_url(base_url, force_reset=True)
        self.http_client.headers.update({"Content-Type": "application/json"})

    def logout(self):
        """
        Logout from the current session.

        Returns:
            None
        """
        self.http_client.headers.pop("x-api-key")
        user_data = load_user_data()
        user_data.pop("api_key")
        save_user_data(user_data)

    def generate_cli_auth_session(self):
        """
        Generate a CLI auth session.

        Returns:
            str: The key to use to verify the CLI auth session.
        """
        resp = self.http_client.get("v1/cli/generate-cli-session")
        resp = resp.json()
        if resp.get("key"):
            return resp["key"]

        raise BadErrorException(
            f"Bad request to cli/generate-cli-session. Status code: {resp.status_code}, response: {resp.text}"
        )

    def verify_cli_auth_session(self, key: str, code: str):
        """
        Verify a CLI auth session.

        Args:
            key (str): The key to verify the CLI auth session with.
            code (str): The code to verify the CLI auth session with.

        Returns:
            dict: The response from the CLI auth session verification.
        """
        resp = self.http_client.get(f"v1/cli/verify-cli-code?key={key}&code={code}")
        return resp.json()

    def initiate_connection(
        self, appName: Union[str, App], integrationId: str = None
    ) -> ConnectionRequest:
        """
        Initiate a connection to a given app.

        Args:
            appName (Union[str, App]): The name of the app to initiate a connection for.
            integrationId (str, optional): The ID of the integration to initiate a connection for. If None, the default integration for the app is used.

        Returns:
            ConnectionRequest: The connection request.
        """
        if integrationId is None:
            if isinstance(appName, App):
                appName = appName.value
            integration = self.sdk.get_default_integration(appName)
            integrationId = integration.id

        resp = self.http_client.post(
            "v1/connectedAccounts",
            json={
                "integrationId": integrationId,
            },
        )
        return ConnectionRequest(self.sdk, **resp.json())

    def set_global_trigger(self, callback_url: str):
        """
        Set a global trigger for the current user.

        Args:
            callback_url (str): The URL to call when the trigger is triggered.

        Returns:
            None
        """
        try:
            self.sdk.set_global_trigger(callback_url)
        except Exception as e:
            raise Exception(f"Failed to set global trigger: {e}") from e

    def disable_trigger(self, trigger_id: str):
        return self.sdk.disable_trigger(trigger_id)

    def list_active_triggers(self, trigger_ids: list[str] = None):
        """
        List all active triggers.

        Args:
            trigger_ids (list[str], optional): A list of trigger IDs to list. If None, all active triggers are listed.

        Returns:
            list: A list of active triggers.
        """
        resp = self.sdk.list_active_triggers(trigger_ids)
        return resp

    def list_triggers(self, app_name: str):
        """
        List all triggers associated with a given app name.

        Args:
            app_name (str): The name of the app for which to list triggers.

        Returns:
            list: A list of triggers associated with the app.
        """
        return self.sdk.list_triggers([app_name])

    def get_trigger_requirements(self, trigger_ids: list[str] = None):
        """
        Retrieves the requirements for a given list of trigger IDs.

        Args:
            trigger_ids (list[str], optional): A list of trigger IDs to retrieve requirements for. If None, requirements for all active triggers are retrieved.

        Returns:
            list: A list of requirements for the given trigger IDs.
        """
        return self.sdk.get_trigger_requirements(trigger_ids)

    def enable_trigger(
        self, trigger_id: str, connected_account_id: str, user_inputs: dict
    ):
        """
        Enable a trigger for a given connected account.

        Args:
            trigger_id (str): The ID of the trigger to enable.
            connected_account_id (str): The ID of the connected account for which to enable the trigger.
            user_inputs (dict): The user inputs to pass to the trigger.

        Returns:
            None
        """
        return self.sdk.enable_trigger(trigger_id, connected_account_id, user_inputs)

    def get_connection(
        self,
        app_name: str,
        entity_id: str = "default",
        connection_id: Optional[str] = None,
    ):
        """
        Retrieves a connection for a given app name and entity ID.

        Args:
            app_name (str): The name of the app for which to retrieve the connection.
            entity_id (str, optional): The ID of the entity for which to retrieve the connection. Defaults to "default".
            connection_id (str, optional): The ID of the connection to retrieve. If None, the first connection found is returned.

        Returns:
            ConnectedAccount: The connected account for the given app name and entity ID.
        """
        entity = self.sdk.get_entity(entity_id)
        return entity.get_connection(app_name, connection_id=connection_id)

    def execute_action(self, action: Action, params: dict, entity_id: str = "default"):
        """
        Execute an action on a given entity.

        Args:
            action (Action): The action to execute.
            params (dict): The parameters to pass to the action.
            entity_id (str, optional): The ID of the entity to execute the action on. Defaults to "default".

        Returns:
            Any: The output of the action execution.
        """
        tool_name = action.value[0]
        no_auth = action.value[2] if len(action.value) > 2 else False
        entity = self.sdk.get_entity(entity_id)
        if no_auth:
            return entity.execute_action(action, params, entity_id=entity_id)

        account = entity.get_connection(tool_name)
        if not account:
            raise NotFoundException(
                f"Entity {entity_id} does not have a connection to {tool_name}"
            )

        resp = account.execute_action(action, params)
        return resp
    def get_list_of_connections(
        self, app_name: list[Union[App, str]] = None
    ) -> list[ConnectedAccount]:
        """
        Retrieves a list of connected accounts filtered by the specified app names.

        Args:
            app_name (list[Union[App, str]], optional): A list of app names or App enum instances to filter the connections. 
                If None, connections for all apps are retrieved.

        Returns:
            list[ConnectedAccount]: A list of ConnectedAccount instances.
        """
        for i, item in enumerate(app_name):
            if isinstance(item, App):
                app_name[i] = item.value

        resp = self.sdk.get_connected_accounts(showActiveOnly=True)
        if app_name is not None:
            resp = [item for item in resp if item.appUniqueId in app_name]

        return [
            {
                "id": item.id,
                "integrationId": item.integrationId,
                "status": item.status,
                "createdAt": item.createdAt,
                "updatedAt": item.updatedAt,
            }
            for item in resp
        ]

    def get_action_enum(self, action_name: str, tool_name: str) -> Action:
        """
        Retrieves the Action enum for a given action name and tool name.

        Args:
            action_name (str): The name of the action.
            tool_name (str): The name of the tool.

        Returns:
            Action: The Action enum for the given action name and tool name.
        """
        return self.sdk.get_action_enum(action_name, tool_name)
