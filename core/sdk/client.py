import json
import os
import time
import requests
import jinja2
# from .storage import get_user_id

from pydantic import BaseModel

class ConnectionResponse(BaseModel):
        connectionStatus: str
        connectionId: str
        redirectUrl: str

class ComposioClient:

    def __init__(self, base_url = "https://backend.composio.dev/api", manage_auth = True):
        self.base_url = base_url
        self.http_client = requests.Session()
        self.http_client.headers.update({
            'Content-Type': 'application/json'
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
    
    def execute_action(self, action_name: str, connection_id: str, input_data: dict):
        resp = self.http_client.post(f"{self.base_url}/v1/actions/{action_name}/execute", json={
            "connectionId": connection_id,
            "input": input_data
        })
        if resp.status_code == 200:
            return resp.json()
        
        raise Exception("Failed to execute action")

    def wait_for_connection(self, connection_id: str):
        while True:
            connection_info = self.get_connection(connection_id)
            if connection_info.get('status') == 'ACTIVE':
                return True
            time.sleep(1)  # Wait for a bit before retrying
    
    def get_actions(self, tool_names: list[str]):
        resp = self.http_client.get(f"{self.base_url}/v1/actions?appNames={','.join(tool_names)}")
        if resp.status_code == 200:
            return resp.json()
        
        raise Exception("Failed to get actions")

