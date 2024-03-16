from .pydantic_utils import json_schema_to_model
from langchain_core.tools import StructuredTool 
from composio.sdk.client import ComposioClient
from typing import List
    
def ComposioTool(client : ComposioClient, action_schema: dict[str, any]) ->  StructuredTool:
    name = action_schema["name"]
    description = action_schema["description"]
    parameters = json_schema_to_model(action_schema["parameters"])
    appName = action_schema["appName"]
    print(parameters.schema())
    return StructuredTool.from_function(
        name=name,
        description=description,
        args_schema=parameters,
        return_schema=True,
        # TODO use execute action here
        func = lambda **kwargs: client.execute_action(name, appName, kwargs)
    )

def ComposioToolset(tool_names: List[str] = []) -> List[StructuredTool]:
    client = ComposioClient()
    actions = client.get_actions(tool_names)
    return [ComposioTool(action) for action in actions["items"]]