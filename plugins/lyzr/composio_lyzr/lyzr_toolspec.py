import os
import types
from inspect import Signature

from lyzr_automata import Tool

from composio import Action, ComposioCore, FrameworkEnum
from composio.sdk.shared_utils import (
    get_signature_format_from_schema_params,
    json_schema_to_model,
)


client = ComposioCore(
    framework=FrameworkEnum.LYZR, api_key=os.environ.get("COMPOSIO_API_KEY", None)
)
ComposioSDK = client.sdk


class ComposioToolset:
    def __init__(self, entity_id: str = "default"):
        global client
        self.client = client
        self.entity_id = entity_id

    def get_lyzr_tool(self, action: Action):
        action_schema = self.client.sdk.get_list_of_actions(actions=[action])[0]
        request_model = json_schema_to_model(action_schema["parameters"])
        response_model = json_schema_to_model(action_schema["response"])

        name = action_schema["name"]
        description = action_schema["description"]
        # appName = action_schema["appName"]
        func_params = get_signature_format_from_schema_params(
            action_schema["parameters"]
        )
        action_signature = Signature(parameters=func_params)
        placeholder_function = (
            lambda **kwargs: self.client.execute_action(  # noqa: E731
                action, kwargs, entity_id=self.entity_id
            )
        )
        action_func = types.FunctionType(
            placeholder_function.__code__,
            globals=globals(),
            name=name,
            closure=placeholder_function.__closure__,
        )
        action_func.__signature__ = action_signature
        action_func.__doc__ = description

        lyzr_tool = Tool(
            name=name,
            desc=description,
            function=action_func,
            function_input=request_model,
            function_output=response_model,
            default_params={},
        )

        return lyzr_tool
