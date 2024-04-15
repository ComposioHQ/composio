import types
from typing import List, Annotated

from .pydantic_utils import json_schema_to_model
from lyzr_automata import Tool
from composio import ComposioCore, App, Action, FrameworkEnum
from typing import List
from inspect import Parameter, Signature
from pydantic import create_model, Field
import os

schema_type_python_type_dict = {
    'string': str,
    'number': float,
    'boolean': bool,
    'integer': int,
}

fallback_values = {
    'string': "",
    'number': 0.0,
    'integer': 0.0,
    'boolean': False,
    'object': {},
    'array': []
}

def pydantic_model_from_param_schema(param_schema):
    required_fields = {}
    optional_fields = {}
    param_title = param_schema['title'].replace(" ", "")
    required_props = param_schema.get('required', [])
    schema_params_object = param_schema.get('properties', {})
    for prop_name, prop_info in param_schema.get('properties', {}).items():
        prop_type = prop_info["type"]
        prop_title = prop_info['title'].replace(" ", "")
        prop_default = prop_info.get('default', fallback_values[prop_type])
        if prop_type in schema_type_python_type_dict:
            signature_prop_type = schema_type_python_type_dict[prop_type]
        else:
            signature_prop_type = pydantic_model_from_param_schema(prop_info)

        if prop_name in required_props:
            required_fields[prop_name] = (signature_prop_type, 
                                Field(..., 
                                    title=prop_title, 
                                    description=prop_info.get('description', 
                                                              prop_info.get('desc', 
                                                                             prop_title))
                                    ))
        else:
            optional_fields[prop_name] = (signature_prop_type, 
                                Field(title=prop_title, 
                                    default=prop_default
                                    ))
    fieldModel = create_model(param_title, **required_fields, **optional_fields)
    return fieldModel
        
def get_signature_format_from_schema_params(
        schema_params
):
    required_parameters = []
    optional_parameters = []

    required_params = schema_params.get('required', [])
    schema_params_object = schema_params.get('properties', {})
    for param_name, param_schema in schema_params_object.items():
        param_type = param_schema['type']
        param_title = param_schema['title'].replace(" ", "")

        if param_type in schema_type_python_type_dict:
            signature_param_type = schema_type_python_type_dict[param_type]
        else:
            signature_param_type = pydantic_model_from_param_schema(param_schema)

        param_default = param_schema.get('default', fallback_values[param_type])
        param_annotation = Annotated[signature_param_type, param_schema.get('description', 
                                                                            param_schema.get('desc',
                                                                                             param_title))]
        param = Parameter(
            name=param_name,
            kind=Parameter.POSITIONAL_OR_KEYWORD,
            annotation=param_annotation,
            default=Parameter.empty if param_name in required_params else param_default 
        )
        is_required = param_name in required_params
        if is_required:
            required_parameters.append(param)
        else :
            optional_parameters.append(param)
    return required_parameters + optional_parameters

client = ComposioCore(framework=FrameworkEnum.LYZR, api_key = os.environ.get("COMPOSIO_API_KEY", None))
ComposioSDK = client.sdk

class ComposioToolset:
    def __init__(self, entity_id: str = None):
        global client
        self.client = client
        self.entity_id = entity_id

    def get_lyzr_tool(self, action: Action):
        action_schema = self.client.sdk.get_list_of_actions(
                                            actions=[action])[0]
        request_model = json_schema_to_model(action_schema["parameters"])
        response_model = json_schema_to_model(action_schema["response"])
        
        name = action_schema["name"]
        description = action_schema["description"]
        # appName = action_schema["appName"]
        func_params = get_signature_format_from_schema_params(action_schema["parameters"])
        action_signature = Signature(parameters=func_params)
        placeholder_function = lambda **kwargs: self.client.execute_action(
                                                    action, kwargs, entity_id=self.entity_id)
        action_func = types.FunctionType(
                                    placeholder_function.__code__, 
                                    globals=globals(), 
                                    name=name, 
                                    closure=placeholder_function.__closure__
                          )
        action_func.__signature__ = action_signature
        action_func.__doc__ = description
    
        lyzr_tool = Tool(
            name=name,
            desc=description,
            function=action_func,
            function_input=request_model,
            function_output=response_model,
            default_params={}
        )
        
        return lyzr_tool
        

# composio_toolset = ComposioToolset()  
# # composio_tool = composio_toolset.get_lyzr_tool(Action.GITHUB_GET_ABOUT_ME)
# composio_tool = composio_toolset.get_lyzr_tool(Action.GITHUB_STAR_REPO)