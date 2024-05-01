import os
import types
from inspect import Signature
from typing import List, Union

from langchain_core.tools import StructuredTool

from composio import Action, App, ComposioCore, FrameworkEnum, Tag
from composio.sdk.exceptions import UserNotAuthenticatedException
from composio.sdk.shared_utils import (
    get_signature_format_from_schema_params,
    json_schema_to_model,
)


def ComposioTool(
    client: ComposioCore, action_schema: dict[str, any], entity_id: str = None
) -> StructuredTool:
    name = action_schema["name"]
    description = action_schema["description"]
    parameters = json_schema_to_model(action_schema["parameters"])
    appName = action_schema["appName"]
    func_params = get_signature_format_from_schema_params(action_schema["parameters"])
    action_signature = Signature(parameters=func_params)
    placeholder_function = lambda **kwargs: client.execute_action(  # noqa: E731
        client.get_action_enum(name, appName), kwargs, entity_id=entity_id
    )
    action_func = types.FunctionType(
        placeholder_function.__code__,
        globals=globals(),
        name=name,
        closure=placeholder_function.__closure__,
    )
    action_func.__signature__ = action_signature
    action_func.__doc__ = description
    return StructuredTool.from_function(
        name=name,
        description=description,
        args_schema=parameters,
        return_schema=True,
        # TODO use execute action here
        func=action_func,
    )

def create_client(api_key=os.environ.get("COMPOSIO_API_KEY", None)):
    try:
        client = ComposioCore(framework=FrameworkEnum.LANGCHAIN, api_key=api_key)
        return client, client.sdk
    except Exception as e:
        # Handle specific exceptions if possible
        raise ConnectionError("Failed to initialize ComposioCore client") from e

client, ComposioSDK = create_client()

def ComposioToolset(
    apps: List[App] = [], actions: List[Action] = [], entity_id: str = "default", tags: List[Union[str, Tag]] = []
) -> List[StructuredTool]:
    if len(apps) > 0 and len(actions) > 0:
        raise ValueError(
            "You must provide either a list of tools or a list of actions, not both"
        )
    if client.is_authenticated() is False:
        raise UserNotAuthenticatedException(
            "User not authenticated. Please authenticate using composio-cli login"
        )
    actions_list = client.sdk.get_list_of_actions(apps=apps, actions=actions, tags=tags)
    return [
        ComposioTool(client, action, entity_id=entity_id) for action in actions_list
    ]
