import json
import os
import time
import requests
import jinja2
# from .storage import get_user_id

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
    
    def create_connection(self, tool_name: str):
        connector_id = f"test-{tool_name}-connector"
        resp = self.http_client.post(f"{self.base_url}/v1/connections", json={
            "connectorId": connector_id,
        })
        if resp.status_code == 200:
            return resp.json()
        
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

    def get_url_for_composio_action(self, toolName: str, actionName: str):
        return f"{self.base_url}/{toolName}/{actionName}"

    def identify_user(self, identifer: str):
        response = requests.post(f"{self.base_url}/user/create/${identifer}", headers={
            'X_COMPOSIO_TOKEN': self.COMPOSIO_TOKEN
        })
        if response.status_code == 200:
            user_id = response.json().get('userId')
            return user_id
        raise Exception("Failed to identify user")

    def get_redirect_url_for_integration(self, integrationName: str, scopes=[]):
        user_id = get_user_id()
        response = requests.post(f"{self.base_url}/user/auth", headers={
            'X_COMPOSIO_TOKEN': self.COMPOSIO_TOKEN,
            'X_ENDUSER_ID': user_id
        }, json={
            'endUserID': user_id,
            'provider': {
                'name': integrationName,
                'scope': scopes
            }
        })

        if response.status_code == 200:
            return list([response.json().get('providerAuthURL'), response.json().get('connectionReqId')])

        print(response.text)
        raise Exception("Failed to get auth URL for integration")

    def get_skills_file_template(self):
        path = os.path.join(os.path.dirname(__file__), 'templates/skills.txt')
        env = jinja2.Environment(loader=jinja2.FileSystemLoader(os.path.dirname(__file__)))
        return env.get_template('templates/skills.txt')

    def list_tools(self):
        user_id = get_user_id()
        if user_id is None:
            raise Exception("No authenticated user found. Please authenticate first.")
        
        url = f"{self.base_url}/all_tools"
        headers = {
          'X_COMPOSIO_TOKEN': self.COMPOSIO_TOKEN,
          'X_ENDUSER_ID': user_id
        }
        response = requests.post(url, headers=headers, json={
            "skip": 0,
            "limit": 1000,
            "actions": True,
            "triggers": False
        })
        if response.status_code == 200:
            tools_data = response.json()
            return tools_data
        else:
           raise Exception("Failed to fetch tools.")
