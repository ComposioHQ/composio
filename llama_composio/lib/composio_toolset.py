import json
import requests
from .composio_tool_spec import ComposioToolSpec
from llama_index.core.tools.tool_spec.base import BaseToolSpec
from .storage import get_user_id
from .composio_tool_spec import BASE_URL

COMPOSIO_TOKEN = "ghp_1J2g3h4i5j6k7l8m9n0o33"

class ComposioToolset(ComposioToolSpec):
    def __init__(self):
        self.user_id = get_user_id()
        print(f"User ID: {self.user_id}")        
        self.authenticated_tools = self.get_authenticated_tools(self.user_id)
        tools_schema = json.dumps({"tools": self.authenticated_tools})  # Combine all tools into a single schema
        super().__init__(tools_schema, COMPOSIO_TOKEN, self.user_id)

    def get_authenticated_tools(self, user_id: str):
        print("Fetching tools...")
        if user_id is None:
            raise Exception("No authenticated user found. Please authenticate first.")

        url = f"{BASE_URL}/all_tools"
        headers = {
            'X_COMPOSIO_TOKEN': COMPOSIO_TOKEN,
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
            authenticated_tools = [
                tool for tool in tools_data.get('tools', []) 
                # if tool['Authentication']['isAuthenticated'] == "True"
                ]
            print("Authenticated tools:", authenticated_tools)
            return authenticated_tools
        else:
            raise Exception("Failed to fetch tools.")
