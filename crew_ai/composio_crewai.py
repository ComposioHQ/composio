import json

from langchain.tools import tool
from core.sdk.client import ComposioClient  # Adjust the import path as necessary

class AvailableAPPsModel(BaseModel):
    list_of_apps: list[str]

class ActionInputData(BaseModel):
    action_name: str
    connection_id: str
    input_data: dict

class ActionOutputData(BaseModel):
    action_name: str
    connection_id: str
    output_data: dict

class ComposioCrewAI:

    def __init__(self):
        # Initialize the ComposioClient with your specific configuration
        self.client = ComposioClient()

    @tool("Execute Action")
    def execute_tool_action(self, inputData: ActionInputData) -> ActionOutputData:
        """
        Executes a specified action for a tool.
        input to this tool should be a pipe-separated string with the following format:
        <action_name>|<connection_id>|<input_data>
        """
        try:
            action_name, connection_id, input_data_str = query.split('|', 2)
            input_data = json.loads(input_data_str)
            result = self.client.execute_action(action_name, connection_id, input_data)
            return ActionOutputData(action_name=action_name, connection_id=connection_id, output_data=result)
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


    @tool("List Tools")
    def list_tools(self):
        """Lists all available tools. The tool are platform which can be used to perform actions on the platform."""
        try:
            tools = self.client.list_tools()
            return json.dumps(tools, indent=2)
        except Exception as e:
            return str(e)
