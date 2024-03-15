import json

from langchain.tools import tool
from core.sdk.client import ComposioClient  # Adjust the import path as necessary

class ComposioCrewAI:

    def __init__(self):
        # Initialize the ComposioClient with your specific configuration
        self.client = ComposioClient()

    @tool("List Available Apps")
    def list_available_apps(self):
        """Lists all available apps in the Composio ecosystem."""
        try:
            apps = self.client.get_list_of_apps()
            return json.dumps(apps, indent=2)
        except Exception as e:
            return str(e)

    @tool("Execute Action")
    def execute_tool_action(self, query: str):
        """
        Executes a specified action for a tool.
        input to this tool should be a pipe-separated string with the following format:
        <action_name>|<connection_id>|<input_data>
        """
        try:
            action_name, connection_id, input_data_str = query.split('|', 2)
            input_data = json.loads(input_data_str)
            result = self.client.execute_action(action_name, connection_id, input_data)
            return json.dumps(result, indent=2)
        except Exception as e:
            return str(e)

    @tool("Get Actions for Tools")
    def get_actions_for_tools(self, tool_names: list):
        """Fetches actions available for a list of tools."""
        try:
            actions = self.client.get_actions(tool_names)
            return json.dumps(actions, indent=2)
        except Exception as e:
            return str(e)

    @tool("Get URL for Action")
    def get_url_for_action(self, query: str):
        """
        Gets the URL for a specific action of a tool.
        input to this tool should be a pipe-separated string with the following format:
        <tool_name>|<action_name>
        """
        try:
            tool_name, action_name = query.split('|', 1)
            url = self.client.get_url_for_composio_action(tool_name, action_name)
            return url
        except Exception as e:
            return str(e)
        
    @tool("Create user for Composio")
    def create_user(self, email: str):
        """Creates a new user in Composio."""
        try:
            user_id = self.client.identify_user(email)
            return json.dumps({"user_id": user_id}, indent=2)
        except Exception as e:
            return str(e)

    @tool("List Tools")
    def list_tools(self):
        """Lists all available tools."""
        try:
            tools = self.client.list_tools()
            return json.dumps(tools, indent=2)
        except Exception as e:
            return str(e)
