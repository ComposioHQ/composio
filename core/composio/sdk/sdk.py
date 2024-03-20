from enum import Enum
import time
from typing import Optional, Union
import requests
from pydantic import BaseModel, ConfigDict

from .enums import Action, App, TestIntegration
from openai.types.chat.chat_completion import ChatCompletion
import json

class SchemaFormat(Enum):
    OPENAI = "openai"
    DEFAULT = "default"

class ConnectionRequest(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    connectionStatus: str
    connectedAccountId: str
    redirectUrl: Optional[str] = None

    sdk_instance: 'Composio' = None

    def __init__(self, sdk_instance: 'Composio', **data):
        super().__init__(**data)
        self.sdk_instance = sdk_instance

    def wait_until_active(self, timeout=60) -> 'ConnectedAccount':  # Timeout adjusted to seconds
        if not self.sdk_instance:
            raise ValueError("SDK instance not set.")
        start_time = time.time()
        while time.time() - start_time < timeout:
            connection_info = self.sdk_instance.get_connected_account(self.connectedAccountId)
            if connection_info.status == 'ACTIVE':
                return connection_info
            time.sleep(1)
        raise TimeoutError("Connection did not become active within the timeout period.")

class OAuth2ConnectionParams(BaseModel):
    scope: Optional[str] = None
    base_url: Optional[str] = None
    client_id: str
    token_type: Optional[str] = None
    access_token: Optional[str] = None
    client_secret: str
    headers: Optional[dict] = None
    queryParams: Optional[dict] = None

class ConnectedAccount(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    integrationId: str
    connectionParams: OAuth2ConnectionParams
    appUniqueId: str
    id: str
    status: str
    createdAt: str
    updatedAt: str

    sdk_instance: 'Composio' = None

    def __init__(self, sdk_instance: 'Composio', **data):
        super().__init__(**data)
        # self.connectionParams = OAuth2ConnectionParams(**self.connectionParams)
        self.sdk_instance = sdk_instance

    def _execute_action(self, action_name: Action, connected_account_id: str, params: dict):
        resp = self.sdk_instance.http_client.post(f"{self.sdk_instance.base_url}/v1/actions/{action_name.value[1]}/execute", json={
            "connectedAccountId": connected_account_id,
            "input": params
        })
        if resp.status_code == 200:
            return resp.json()
        raise Exception("Failed to execute action")
    
    def execute_action(self, action_name: Action, params: dict):
        resp = self._execute_action(action_name, self.id, params)
        return resp
    
    def get_all_actions(self, format: SchemaFormat = SchemaFormat.DEFAULT):
        app_unique_id = self.appUniqueId
        resp = self.sdk_instance.http_client.get(f"{self.sdk_instance.base_url}/v1/actions?appNames={app_unique_id}")
        if resp.status_code == 200:
            actions = resp.json()
            if format == SchemaFormat.OPENAI:
                return [
                    {"type": "function", "function": {
                        "name": action["name"],
                        "description": action.get("description", ""),
                        "parameters": action.get("parameters", {})
                    }} for action in actions["items"]
                ]
            else: 
                return actions["items"]
        
        raise Exception("Failed to get actions")

    def handle_tools_calls(self, tool_calls: ChatCompletion) -> list[any]:
        output = []
        try: 
            if tool_calls.choices:
                for choice in tool_calls.choices:
                    if choice.message.tool_calls:
                        for tool_call in choice.message.tool_calls:
                            function = tool_call.function
                            action = self.sdk_instance.get_action_enum(function.name, self.appUniqueId)
                            arguments = json.loads(function.arguments)
                            output.append(self.execute_action(action, arguments))
        except Exception as e:
            print(e)
            return output
        
        return output

        

class Integration(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    id: str
    name: str
    authScheme: str
    authConfig: dict = {}
    createdAt: str
    updatedAt: str
    enabled: bool
    deleted: bool
    appId: str
    defaultConnectorId: Optional[str] = None
    expectedInputFields: list = []
    logo: str
    appName: str
    useComposioAuth: bool = False

    sdk_instance: 'Composio' = None  # type: ignore

    def __init__(self, sdk_instance: 'Composio', **data):
        super().__init__(**data)
        self.sdk_instance = sdk_instance
    
    def initiate_connection(self, user_uuid: str = None, params: dict = {}) -> ConnectionRequest:
        resp = self.sdk_instance.http_client.post(f"{self.sdk_instance.base_url}/v1/connectedAccounts", json={
            "integrationId": self.id,
            "data": params
        })
        if resp.status_code == 200:
            return ConnectionRequest(self.sdk_instance, **resp.json())
        
        raise Exception("Failed to create connection")
    
    def get_required_variables(self):
        return self.expectedInputFields

class Composio:
    def __init__(self, api_key: str = None, base_url = "https://backend.composio.dev/api"):
        self.base_url = base_url
        self.api_key = api_key
        self.http_client = requests.Session()
        self.http_client.headers.update({
            'Content-Type': 'application/json',
            'x-api-key': self.api_key
        })

    def get_list_of_apps(self):
        resp = self.http_client.get(f"{self.base_url}/v1/apps") 
        return resp.json()

    def get_list_of_actions(self, apps: list[App] = None, actions: list[Action] = None) -> list:
        if apps is None or len(apps) == 0:
            resp = self.http_client.get(f"{self.base_url}/v1/actions")
        else:
            app_unique_ids = [app.value for app in apps]
            resp = self.http_client.get(f"{self.base_url}/v1/actions?appNames={','.join(app_unique_ids)}")
        if resp.status_code == 200:
            actions_response = resp.json()
            if actions is not None and len(actions) > 0:
                filtered_actions = []
                action_names_list = [action.value[1] for action in actions]
                for item in actions_response["items"]:
                    if item["name"] in action_names_list:
                        filtered_actions.append(item)
                return filtered_actions
            else:
                return actions_response["items"]
        
        raise Exception("Failed to get actions")

    def get_list_of_integrations(self) -> list[Integration]:
        resp = self.http_client.get(f"{self.base_url}/v1/integrations")
        if resp.status_code != 200:
            raise Exception("Failed to get integrations")

        resp = resp.json()
        return [Integration(self, **app) for app in resp["items"]]

    def get_integration(self, connector_id: Union[str, TestIntegration]) -> Integration:
        if isinstance(connector_id, TestIntegration):
            connector_id = connector_id.value
        resp = self.http_client.get(f"{self.base_url}/v1/integrations/{connector_id}")
        if resp.status_code == 200:
            return Integration(self, **resp.json())

        raise Exception("Failed to get connector")


    def get_connected_account(self, connection_id: str) -> ConnectedAccount:
        resp = self.http_client.get(f"{self.base_url}/v1/connectedAccounts/{connection_id}")
        if resp.status_code == 200:
            return ConnectedAccount(self, **resp.json())
        
        raise Exception("Failed to get connection")

    def get_list_of_connected_accounts(self) -> list[ConnectedAccount]:
        resp = self.http_client.get(f"{self.base_url}/v1/connectedAccounts")
        if resp.status_code == 200:
            return [ConnectedAccount(self, **item) for item in resp.json()["items"]]
        
        raise Exception("Failed to get connected accounts")
    
    def get_action_enum(self, action_name: str, tool_name: str) -> Action:
        for action in Action:
            if action.action == action_name.lower() and action.service == tool_name.lower():
                return action
        raise ValueError(f"No matching action found for action: {action_name.lower()} and tool: {tool_name.lower()}")
