import os
from enum import Enum
from typing import Union

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
                            f"v1/client/auth/track",
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
        self.http_client.headers.update(
            {"Content-Type": "application/json", "x-api-key": api_key}
        )
        self.sdk = Composio(api_key=api_key, base_url=self.base_url)

    def get_authenticated_user(self):
        composio_api_key = os.environ.get("COMPOSIO_API_KEY", None)
        api_key = composio_api_key if composio_api_key else get_api_key()
        return {
            "api_key": api_key,
        }

    def is_authenticated(self):
        if self.sdk is None:
            return False
        return True

    def set_base_url(self, base_url: str):
        self.base_url = base_url
        set_base_url(base_url, force_reset=True)
        self.http_client.headers.update({"Content-Type": "application/json"})

    def logout(self):
        self.http_client.headers.pop("x-api-key")
        user_data = load_user_data()
        user_data.pop("api_key")
        save_user_data(user_data)

    def generate_cli_auth_session(self):
        resp = self.http_client.get(f"v1/cli/generate-cli-session")
        resp = resp.json()
        if resp.get("key"):
            return resp["key"]

        raise BadErrorException(
            f"Bad request to cli/generate-cli-session. Status code: {resp.status_code}, response: {resp.text}"
        )

    def verify_cli_auth_session(self, key: str, code: str):
        resp = self.http_client.get(
            f"v1/cli/verify-cli-code?key={key}&code={code}"
        )
        return resp.json()

    def initiate_connection(
        self, appName: Union[str, App], integrationId: str = None
    ) -> ConnectionRequest:
        if integrationId is None:
            if isinstance(appName, App):
                appName = appName.value
            integration = self.sdk.get_default_integration(appName)
            integrationId = integration.id

        resp = self.http_client.post(
            f"v1/connectedAccounts",
            json={
                "integrationId": integrationId,
            },
        )
        return ConnectionRequest(self.sdk, **resp.json())

    def set_global_trigger(self, callback_url: str):
        try:
            self.sdk.set_global_trigger(callback_url)
        except Exception as e:
            raise Exception(f"Failed to set global trigger: {e}") from e

    def disable_trigger(self, trigger_id: str):
        return self.sdk.disable_trigger(trigger_id)

    def list_active_triggers(self, trigger_ids: list[str] = None):
        resp = self.sdk.list_active_triggers(trigger_ids)
        return resp

    def list_triggers(self, app_name: str):
        return self.sdk.list_triggers([app_name])

    def get_trigger_requirements(self, trigger_ids: list[str] = None):
        return self.sdk.get_trigger_requirements(trigger_ids)

    def enable_trigger(
        self, trigger_id: str, connected_account_id: str, user_inputs: dict
    ):
        return self.sdk.enable_trigger(
            trigger_id, connected_account_id, user_inputs
        )

    def get_connection(self, app_name: str, entity_id: str = "default"):
        entity = self.sdk.get_entity(entity_id)
        return entity.get_connection(app_name)

    def execute_action(self, action: Action, params: dict, entity_id: str = "default"):
        tool_name = action.value[0]
        no_auth = action.value[2] if len(action.value) > 2 else False
        if no_auth:
            resp = self.sdk.no_auth_execute_action(action, params)
            return resp
        entity = self.sdk.get_entity(entity_id)
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
        return self.sdk.get_action_enum(action_name, tool_name)
