from typing import Union
import requests

from .utils import get_git_user_info
from .sdk import ConnectionRequest, ConnectedAccount
from .storage import delete_user_connections, get_base_url, get_user_connection, get_api_key, load_user_data, save_api_key, save_user_data, set_base_url
from .sdk import Composio
from .enums import TestIntegration, Action, App
from enum import Enum

class FrameworkEnum(Enum):
    AUTOGEN = "autogen"
    LANGCHAIN = "langchain"

__IS_FIRST_TIME__ = True

class ComposioCore:
    sdk: Composio = None
    framework: FrameworkEnum = None

    def __init__(self, base_url = get_base_url(), manage_auth = True, framework: FrameworkEnum = None):
        global __IS_FIRST_TIME__

        self.base_url = base_url
        self.manage_auth = manage_auth
        self.http_client = requests.Session()
        self.framework = framework
        self.http_client.headers.update({
            'Content-Type': 'application/json'
        })

        if manage_auth:
            api_key = get_api_key()
            if api_key:
                self.http_client.headers.update({
                    'Content-Type': 'application/json',
                    'x-api-key': api_key
                });
                self.sdk = Composio(api_key, base_url)
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
        delete_user_connections()
        save_user_data(user_data)

    def authenticate(self, hash: str):
        resp = self.http_client.post(f"{self.base_url}/v1/client/auth/identify", json={
            "hash": hash,
        });
        if resp.status_code == 202:
            api_key = resp.json().get('apiKey')
            self.http_client.headers.update({
                'Content-Type': 'application/json',
                'x-api-key': api_key
            })
            self.sdk = Composio(api_key, self.base_url)
            if self.manage_auth:
                save_api_key(api_key)
            return api_key

        raise Exception("Failed to authenticate")
    
    def initiate_connection(self, integrationId: Union[str, TestIntegration]) -> ConnectionRequest:
        if isinstance(integrationId, TestIntegration):
            integrationId = integrationId.value

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

    def get_saved_connections(self, app_name: str = None):
        connectionId = get_user_connection(app_name)
        return connectionId

    def execute_action(self, action: Action, params: dict):
        tool_name  = action.value[0]
        connectionId = get_user_connection(tool_name)
        if not connectionId:
            raise Exception(f"User not authenticated or connection not found. Please authenticate using: composio-cli add {tool_name}")

        account = self.sdk.get_connected_account(connectionId)
        resp = account.execute_action(action, params)
        return resp

    def get_list_of_connections(self, app_name: list[App | str] = None) -> list[ConnectedAccount]:
        for i, item in enumerate(app_name):
            if isinstance(item, App):
                app_name[i] = item.value

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
