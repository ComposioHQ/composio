import time
import requests
from pydantic import BaseModel

from .sdk import ConnectionRequest, ConnectedAccount
from .storage import get_user_connection, get_api_key, save_api_key, save_user_connection
from uuid import getnode as get_mac
from .sdk import ComposioSdk
from .enums import TestIntegration, Action

class ComposioCore:
    sdk: ComposioSdk = None

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
                self.sdk = ComposioSdk(api_key, base_url)

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
            self.sdk = ComposioSdk(api_key, self.base_url)
            if self.manage_auth:
                save_api_key(api_key)
            return api_key

        raise Exception("Failed to authenticate")
    
    def initiate_connection(self, connectorId: str | TestIntegration) -> ConnectionRequest:
        if isinstance(connectorId, TestIntegration):
            connectorId = connectorId.value

        resp = self.http_client.post(f"{self.base_url}/v1/connections", json={
            "connectorId": connectorId,
        })
        if resp.status_code == 200:
            return ConnectionRequest(self.sdk, **resp.json())
        
        raise Exception("Failed to create connection")
    
    def execute_action(self, action: Action, input_data: dict):
        connectionId = get_user_connection(action.value[0])
        if not connectionId:
            raise Exception(f"User not authenticated or connection not found. Please authenticate using: composio-cli add {tool_name}")

        app_integration = self.sdk.get_connected_account(connectionId)
        resp = app_integration.execute_action(action, input_data)
        return resp

    def get_list_of_connections(self):
        resp = self.sdk.get_list_of_connections()
        return [{
            "id": item.id,
            "connectorId": item.connectorId,
            "status": item.status,
            "createdAt": item.createdAt,
            "updatedAt": item.updatedAt
        } for item in resp]

    def get_action_enum(self, action_name: str, tool_name: str) -> Action:
        for action in Action:
            if action.action == action_name and action.service == tool_name.lower():
                return action
        raise ValueError(f"No matching action found for action: {action_name} and tool: {tool_name}")
