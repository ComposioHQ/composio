from .pydantic_utils import json_schema_to_model
from langchain_core.tools import StructuredTool 
from composio import ComposioCore, App, Action
from typing import List
    
def ComposioTool(client : ComposioCore, action_schema: dict[str, any]) ->  StructuredTool:
    name = action_schema["name"]
    description = action_schema["description"]
    parameters = json_schema_to_model(action_schema["parameters"])
    appName = action_schema["appName"]
    return StructuredTool.from_function(
        name=name,
        description=description,
        args_schema=parameters,
        return_schema=True,
        # TODO use execute action here
        func = lambda **kwargs: client.execute_action(client.get_action_enum(name, appName), kwargs)
    )

def ComposioToolset(apps: List[App] = [], actions: List[Action] = []) -> List[StructuredTool]:
    if len(apps) >0 and len(actions) > 0:
        raise ValueError("You must provide either a list of tools or a list of actions, not both")
    client = ComposioCore()
    actions_list = client.sdk.get_list_of_actions(apps, actions)
    return [ComposioTool(client, action) for action in actions_list]

