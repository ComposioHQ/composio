import time
import requests
from pydantic import BaseModel
from .storage import get_user_connection, get_api_key, save_api_key, save_user_connection
from uuid import getnode as get_mac

class ConnectionResponse(BaseModel):
        connectionStatus: str
        connectionId: str
        redirectUrl: str

class ComposioClient:

    def __init__(self, base_url = "https://backend.composio.dev/api", manage_auth = True):
        self.base_url = base_url
        self.manage_auth = manage_auth
        self.http_client = requests.Session()
        self.http_client.headers.update({
            'Content-Type': 'application/json'
        })

        if manage_auth:
            api_key = get_api_key()
            if api_key:
                self.http_client.headers.update({
                    'Content-Type': 'application/json',
                    'x-api-key': api_key
                })

    def authenticate(self, hash: str):
        resp = self.http_client.post(f"{self.base_url}/v1/client/auth/identify", json={
            "hash": hash
        });
        if resp.status_code == 202:
            api_key = resp.json().get('apiKey')
            self.http_client.headers.update({
                'Content-Type': 'application/json',
                'x-api-key': api_key
            })
            if self.manage_auth:
                save_api_key(api_key)
            return api_key

        raise Exception("Failed to authenticate")

    def get_list_of_apps(self):
        resp = self.http_client.get(f"{self.base_url}/v1/apps") 
        return resp.json()
    
    def get_connector(self, tool_name: str):
        connector_id = f"test-{tool_name}-connector"
        resp = self.http_client.get(f"{self.base_url}/v1/connectors/{connector_id}")
        if resp.status_code == 200:
            return resp.json()

        raise Exception("Failed to get connector")

    def create_connection(self, tool_name: str) -> ConnectionResponse:
        connector_id = f"test-{tool_name}-connector"
        resp = self.http_client.post(f"{self.base_url}/v1/connections", json={
            "connectorId": connector_id,
        })
        if resp.status_code == 200:
            return ConnectionResponse(**resp.json())
        
        raise Exception("Failed to create connection")

    def get_connection(self, connection_id: str):
        resp = self.http_client.get(f"{self.base_url}/v1/connections/{connection_id}")
        if resp.status_code == 200:
            return resp.json()
        
        raise Exception("Failed to get connection")
    
    def _execute_action(self, action_name: str, connection_id: str, input_data: dict):
        resp = self.http_client.post(f"{self.base_url}/v1/actions/{action_name}/execute", json={
            "connectionId": connection_id,
            "input": input_data
        })
        if resp.status_code == 200:
            return resp.json()
        
        raise Exception("Failed to execute action")
    
    def execute_action(self, action_name: str, tool_name: str, input_data: dict):
        connection = get_user_connection(tool_name)
        if not connection:
            raise Exception(f"User not authenticated or connection not found. Please authenticate using: composio-cli add {tool_name}")

        resp = self._execute_action(action_name, connection, input_data)
        return resp

    def wait_for_connection(self, connection_id: str, app_name: str):
        while True:
            connection_info = self.get_connection(connection_id)
            if connection_info.get('status') == 'ACTIVE':
                if self.manage_auth:
                    app_name = connection_info.get("appName", app_name)
                    save_user_connection(connection_id, app_name)
                    return True
            time.sleep(1)  # Wait for a bit before retrying
    
    def get_actions(self, tool_names: list[str]):
        if not tool_names:
            resp = self.http_client.get(f"{self.base_url}/v1/actions")
        else:
            resp = self.http_client.get(f"{self.base_url}/v1/actions?appNames={','.join(tool_names)}")
        if resp.status_code == 200:
            return resp.json()
        
        raise Exception("Failed to get actions")

