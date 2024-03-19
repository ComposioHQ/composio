import time
import requests
from pydantic import BaseModel

from core.composio.sdk.enums import TestConnectors
from .storage import get_user_connection, get_api_key, save_api_key, save_user_connection
from uuid import getnode as get_mac
from .sdk import ComposioSdk

class ConnectionRequest(BaseModel):
    connectionStatus: str
    connectionId: str
    redirectUrl: str

    def __init__(self, sdk_instance: ComposioSdk, **data):
        super().__init__(**data)
        self.sdk_instance = sdk_instance

    def wait_until_active(self):
        if not self.sdk_instance:
            raise ValueError("SDK instance not set.")
        while True:
            connection_info = self.sdk_instance.get_connected_account(self.connectionId)
            if connection_info.get('status') == 'ACTIVE':
                app_name = connection_info.get("appName", "Unknown")
                save_user_connection(self.connectionId, app_name)
                return True
            time.sleep(1)

class OAuth2ConnectionParams(BaseModel):
    scope: str
    base_url: str
    client_id: str
    token_type: str
    access_token: str
    client_secret: str
    headers: dict
    queryParams: dict

class ConnectedAccount(BaseModel):
    connectorId: str
    connectionParams: OAuth2ConnectionParams
    appUniqueId: str
    id: str
    status: str
    createdAt: str
    updatedAt: str

    def __init__(self, sdk_instance: ComposioSdk, **data):
        super().__init__(**data)
        self.connectionParams = OAuth2ConnectionParams(**self.connectionParams)
        self.sdk_instance = sdk_instance

    def _execute_action(self, action_name: str, connection_id: str, input_data: dict):
        resp = self.http_client.post(f"{self.sdk_instance.base_url}/v1/actions/{action_name}/execute", json={
            "connectionId": connection_id,
            "input": input_data
        })
        if resp.status_code == 200:
            return resp.json()
        
        raise Exception("Failed to execute action")
    
    def execute_action(self, action_name: str, tool_name: str, input_data: dict):
        connection = get_user_connection(tool_name.lower())
        if not connection:
            raise Exception(f"User not authenticated or connection not found. Please authenticate using: composio-cli add {tool_name}")

        resp = self._execute_action(action_name, connection, input_data)
        return resp
    
    def get_all_actions(self, format: str):
        app_unique_id = self.appUniqueId
        resp = self.http_client.get(f"{self.base_url}/v1/actions?appNames={app_unique_id}")
        if resp.status_code == 200:
            return resp.json()
        
        raise Exception("Failed to get actions")


class AppIntegration(BaseModel):
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

    def __init__(self, sdk_instance: ComposioSdk, **data):
        super().__init__(**data)
        self.sdk_instance = sdk_instance

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

    def get_list_of_app_integrations(self) -> list[AppIntegration]:
        resp = self.http_client.get(f"{self.base_url}/v1/connectors")
        if resp.status_code != 200:
            raise Exception("Failed to get connectors")

        resp = resp.json()
        return [AppIntegration(self, **app) for app in resp["items"]]

    def get_app_integration(self, connector_id: str | TestConnectors) -> AppIntegration:
        resp = self.http_client.get(f"{self.base_url}/v1/connectors/{connector_id}")
        if resp.status_code == 200:
            return AppIntegration(self, **resp.json())

        raise Exception("Failed to get connector")

    def initiate_connection(self, tool_name: str) -> ConnectionRequest:
        connector_id = f"test-{tool_name}-connector"
        resp = self.http_client.post(f"{self.base_url}/v1/connections", json={
            "connectorId": connector_id,
        })
        if resp.status_code == 200:
            return ConnectionRequest(self, **resp.json())
        
        raise Exception("Failed to create connection")

    def get_connected_account(self, connection_id: str) -> ConnectedAccount:
        resp = self.http_client.get(f"{self.base_url}/v1/connections/{connection_id}")
        if resp.status_code == 200:
            return ConnectedAccount(self, **resp.json())
        
        raise Exception("Failed to get connection")
