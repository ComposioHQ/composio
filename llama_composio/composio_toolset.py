import json
import requests
from .composio_tool_spec import ComposioToolSpec
from llama_index.core.tools.tool_spec.base import BaseToolSpec

class ComposioToolset(BaseToolSpec):
    def __init__(self, base_url: str, composio_token: str):
        self.base_url = base_url
        self.composio_token = composio_token
        self.user_id = self.get_user_id()
        self.authenticated_tools = self.get_authenticated_tools()
        self.tool_spec = self.create_composio_tool_spec()
        self.spec_functions = self.tool_spec.spec_functions

    def get_user_id(self):
        try:
            with open('user_data.json', 'r') as infile:
                user_data = json.load(infile)
                return user_data.get('user_id')
        except FileNotFoundError:
            print("User data file not found. Please authenticate first.")
            return None

    def get_authenticated_tools(self):
        if self.user_id is None:
            return []

        url = f"{self.base_url}/tools"
        headers = {
            'X_COMPOSIO_TOKEN': self.composio_token,
            'X_ENDUSER_ID': self.user_id
        }
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            tools_data = response.json()
            authenticated_tools = [tool for tool in tools_data.get('tools', []) if tool['Authentication']['isAuthenticated'] == "True"]
            return authenticated_tools
        else:
            print("Failed to fetch tools.")
            return []

    def create_composio_tool_spec(self):
        tools_schema = json.dumps({"tools": self.authenticated_tools})  # Combine all tools into a single schema
        tool_spec = ComposioToolSpec(tools_schema)
        return tool_spec

