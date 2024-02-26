import json
import requests
from .composio_tool_spec import ComposioToolSpec
from llama_index.core.tools.tool_spec.base import BaseToolSpec
from storage import get_user_id

class ComposioToolset(ComposioToolSpec):
    def __init__(self, composio_token: str):
        self.authenticated_tools = self.get_authenticated_tools()
        tools_schema = json.dumps({"tools": self.authenticated_tools})  # Combine all tools into a single schema
        super().__init__(tools_schema, composio_token, get_user_id())

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

