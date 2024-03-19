import time
from typing import Optional
import requests
from pydantic import BaseModel, ConfigDict

from .enums import Action, App, TestIntegration
from .storage import get_user_connection, get_api_key, save_api_key, save_user_connection
from uuid import getnode as get_mac

class ConnectionRequest(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    connectionStatus: str
    connectionId: str
    redirectUrl: str

    sdk_instance: 'ComposioSdk' = None

    def __init__(self, sdk_instance: 'ComposioSdk', **data):
        super().__init__(**data)
        self.sdk_instance = sdk_instance

    def wait_until_active(self, timeout=60) -> 'ConnectedAccount':  # Timeout adjusted to seconds
        if not self.sdk_instance:
            raise ValueError("SDK instance not set.")
        start_time = time.time()
        while time.time() - start_time < timeout:
            connection_info = self.sdk_instance.get_connected_account(self.connectionId)
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
    connectorId: str
    connectionParams: OAuth2ConnectionParams
    appUniqueId: str
    id: str
    status: str
    createdAt: str
    updatedAt: str

    sdk_instance: 'ComposioSdk' = None

    def __init__(self, sdk_instance: 'ComposioSdk', **data):
        super().__init__(**data)
        # self.connectionParams = OAuth2ConnectionParams(**self.connectionParams)
        self.sdk_instance = sdk_instance

    def _execute_action(self, action_name: Action, connection_id: str, input_data: dict):
        print({
            "connectionId": connection_id,
            "input": input_data
        })

        resp = self.sdk_instance.http_client.post(f"{self.sdk_instance.base_url}/v1/actions/{action_name.value[1]}/execute", json={
            "connectionId": connection_id,
            "input": input_data
        })
        if resp.status_code == 200:
            return resp.json()
        raise Exception("Failed to execute action")
    
    def execute_action(self, action_name: Action, input_data: dict):
        resp = self._execute_action(action_name, self.id, input_data)
        return resp
    
    def get_all_actions(self, format: str):
        app_unique_id = self.appUniqueId
        resp = self.sdk_instance.http_client.get(f"{self.sdk_instance.base_url}/v1/actions?appNames={app_unique_id}")
        if resp.status_code == 200:
            return resp.json()
        
        raise Exception("Failed to get actions")

class AppIntegration(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    id: str
    name: str
    authScheme: str
    authConfig: dict
    createdAt: str
    updatedAt: str
    enabled: bool
    deleted: bool
    appId: str
    defaultConnectorId: str
    expectedInputFields: list
    logo: str
    appName: str
    useComposioAuth: bool

    sdk_instance: 'ComposioSdk' = None  # type: ignore

    def __init__(self, sdk_instance: 'ComposioSdk', **data):
        super().__init__(**data)
        self.sdk_instance = sdk_instance
    
    def initiate_connection(self, user_uuid: str = None) -> ConnectionRequest:
        connector_id = f"test-{self.appName}-connector"
        resp = self.sdk_instance.http_client.post(f"{self.sdk_instance.base_url}/v1/connections", json={
            "connectorId": connector_id,
        })
        if resp.status_code == 200:
            return ConnectionRequest(self.sdk_instance, **resp.json())
        
        raise Exception("Failed to create connection")
    
    def get_required_variables(self):
        return self.expectedInputFields

class ComposioSdk:
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

    def get_list_of_actions(self, app_unique_id: list[App] = None, action_names: list[Action] = None) -> list:
        if app_unique_id is None or len(app_unique_id) == 0:
            resp = self.http_client.get(f"{self.base_url}/v1/actions")
        else:
            app_unique_ids = [app.value for app in app_unique_id]
            resp = self.http_client.get(f"{self.base_url}/v1/actions?appNames={','.join(app_unique_ids)}")
        if resp.status_code == 200:
            actions = resp.json()
            action_names_list = [action.value[1] for action in action_names]
            if action_names is not None and len(action_names) > 0:
                filtered_actions = []
                for item in actions["items"]:
                    if item["name"] in action_names_list:
                        filtered_actions.append(item)
                return filtered_actions
            else:
                return actions["items"]
        
        raise Exception("Failed to get actions")

    def get_list_of_app_integrations(self) -> list[AppIntegration]:
        resp = self.http_client.get(f"{self.base_url}/v1/connectors")
        if resp.status_code != 200:
            raise Exception("Failed to get connectors")

        resp = resp.json()
        return [AppIntegration(self, **app) for app in resp["items"]]

    def get_app_integration(self, connector_id: str | TestIntegration) -> AppIntegration:
        if isinstance(connector_id, TestIntegration):
            connector_id = connector_id.value
        resp = self.http_client.get(f"{self.base_url}/v1/connectors/{connector_id}")
        if resp.status_code == 200:
            return AppIntegration(self, **resp.json())

        raise Exception("Failed to get connector")


    def get_connected_account(self, connection_id: str) -> ConnectedAccount:
        resp = self.http_client.get(f"{self.base_url}/v1/connections/{connection_id}")
        if resp.status_code == 200:
            return ConnectedAccount(self, **resp.json())
        
        raise Exception("Failed to get connection")
