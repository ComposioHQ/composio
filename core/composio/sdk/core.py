from typing import Union
import requests

from .utils import get_git_user_info
from .sdk import ConnectionRequest, ConnectedAccount
from .storage import get_base_url, get_api_key, load_user_data, save_user_data, set_base_url
from .sdk import Composio
from .enums import Action, App
from enum import Enum
import os

class FrameworkEnum(Enum):
    AUTOGEN = "autogen"
    LANGCHAIN = "langchain"
    LYZR = "lyzr"

__IS_FIRST_TIME__ = True

class UnauthorizedAccessException(Exception):
    pass

class ComposioCore:
    sdk: Composio = None
    framework: FrameworkEnum = None

    def __init__(self, base_url = get_base_url(), manage_auth = True, framework: FrameworkEnum = None, api_key: str = None):
        global __IS_FIRST_TIME__

        self.base_url = base_url
        self.manage_auth = manage_auth
        self.http_client = requests.Session()
        self.framework = framework
        self.http_client.headers.update({
            'Content-Type': 'application/json'
        })

        if manage_auth:
            api_key_to_use = api_key if api_key else get_api_key()
            if api_key_to_use:
                self.http_client.headers.update({
                    'Content-Type': 'application/json',
                    'x-api-key': api_key_to_use
                });
                self.sdk = Composio(api_key=api_key_to_use, base_url=base_url)
                if framework is not None and __IS_FIRST_TIME__ == True:
                    try: 
                        git_info = get_git_user_info()
                        self.http_client.post(f"{self.base_url}/v1/client/auth/track", json={
                            "framework": self.framework.value,
                            "user_git_user_info": {
                                "name": git_info.name,
                                "email": git_info.email
                            } if git_info.name and git_info.email else None
                        });
                        __IS_FIRST_TIME__ = False
                    except:
                        pass
    
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
        self.http_client.headers.update({
            'Content-Type': 'application/json'
        })
    
    def logout(self):
        self.http_client.headers.pop('x-api-key')
        user_data = load_user_data()
        user_data.pop('api_key')
        save_user_data(user_data)

    def generate_cli_auth_session(self):
        resp = self.http_client.get(f"{self.base_url}/v1/cli/generate-cli-session");
        if resp.status_code == 200:
            resp = resp.json()
            if resp.get('key'):
                return resp['key']

        raise Exception("Bad request to cli/generate-cli-session")
    
    def verify_cli_auth_session(self, key: str, code: str):
        resp = self.http_client.get(f"{self.base_url}/v1/cli/verify-cli-code?key={key}&code={code}");
        if resp.status_code == 200:
            return resp.json()
        elif resp.status_code == 401:
            raise UnauthorizedAccessException("UnauthorizedError: Unauthorized access to cli/verify-cli-session")
        
        raise Exception("Bad request to cli/verify-cli-session")
    
    def initiate_connection(self, appName: Union[str, App], integrationId: str = None) -> ConnectionRequest:
        if integrationId is None:
            if isinstance(appName, App):
                appName = appName.value
            integration = self.sdk.get_default_integration(appName)
            integrationId = integration.id

        resp = self.http_client.post(f"{self.base_url}/v1/connectedAccounts", json={
            "integrationId": integrationId,
        })
        if resp.status_code == 200:
            return ConnectionRequest(self.sdk, **resp.json())
        
        raise Exception("Failed to create connection")
    
    def set_global_trigger(self, callback_url: str):
        try:
            self.sdk.set_global_trigger(callback_url)
        except Exception as e:
            raise Exception(f"Failed to set global trigger: {e}")

    def disable_trigger(self, trigger_id: str):
        return self.sdk.disable_trigger(trigger_id)
 
    def list_active_triggers(self, trigger_ids: list[str] = None):
        try:
            resp = self.sdk.list_active_triggers(trigger_ids)
            return resp
        except Exception as e:
            raise e

    def list_triggers(self, app_name: str):
        try:
            return self.sdk.list_triggers([app_name])
        except Exception as e:
            raise Exception(f"Failed to list triggers: {e}")
        
    def get_trigger_requirements(self, trigger_ids: list[str] = None):
        try:
            return self.sdk.get_trigger_requirements(trigger_ids)
        except Exception as e:
            raise Exception(f"Failed to enable trigger: {e}")
    
    def enable_trigger(self, trigger_id: str, connected_account_id: str, user_inputs: dict):
        try:
            return self.sdk.enable_trigger(trigger_id, connected_account_id, user_inputs)
        except Exception as e:
            raise Exception(e)
        
    def get_connection(self, app_name: str, entity_id: str = "default"):
        entity = self.sdk.get_entity(entity_id)
        return entity.get_connection(app_name)

    def execute_action(self, action: Action, params: dict, entity_id: str = "default"):
        tool_name  = action.value[0]
        entity = self.sdk.get_entity(entity_id)
        account = entity.get_connection(tool_name)
        if not account:
            raise Exception(f"Entity {entity_id} does not have a connection to {tool_name}")

        resp = account.execute_action(action, params)
        return resp

    def get_list_of_connections(self, app_name: list[Union[App, str]] = None) -> list[ConnectedAccount]:
        for i, item in enumerate(app_name):
            if isinstance(item, App):
                app_name[i] = item.value
        
        resp = []
        if app_name is not None:
            resp = [item for item in resp if item.appUniqueId in app_name]

        return [{
            "id": item.id,
            "integrationId": item.integrationId,
            "status": item.status,
            "createdAt": item.createdAt,
            "updatedAt": item.updatedAt
        } for item in resp]

    def get_action_enum(self, action_name: str, tool_name: str) -> Action:
        return self.sdk.get_action_enum(action_name, tool_name)
