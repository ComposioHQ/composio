import types
import logging
from inspect import Parameter, Signature
from typing import Union, List, Annotated

import autogen
from composio import ComposioCore, App, Action, FrameworkEnum
from pydantic import create_model, Field
from autogen.agentchat.conversable_agent import ConversableAgent

logger = logging.getLogger(__name__)

schema_type_python_type_dict = {
    'string': str,
    'number': float,
    'boolean': bool,
    'integer': int
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

    for param_name, param_schema in schema_params.get('properties', {}).items():
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
        else:
            optional_parameters.append(param)
    return required_parameters + optional_parameters

class ComposioToolset:
    def __init__(self, caller = None, executor = None):
        self.caller = caller
        self.executor = executor
        self.client =  ComposioCore(framework=FrameworkEnum.AUTOGEN)


    def register_tools(
            self,
            tools: Union[App, List[App]],
            caller: ConversableAgent = None,
            executor: ConversableAgent = None
        ):
        if isinstance(tools, App):
            tools = [tools]
        assert caller or self.caller, "If caller hasn't been specified during initialization, has to be specified during registration"
        assert executor or self.executor, "If executor hasn't been specified during initialization, has to be specified during registration"

        action_schemas = self.client.sdk.get_list_of_actions(
                                                apps=tools)
        
        for schema in action_schemas:
            self._register_schema_to_autogen(action_schema=schema,
                                            caller = caller if caller else self.caller,
                                            executor = executor if executor else self.executor)

            
    def register_actions(
            self,
            actions: Union[Action, List[Action]],
            caller: ConversableAgent = None,
            executor: ConversableAgent = None
        ):
        if isinstance(actions, Action):
            actions = [actions]

        assert caller or self.caller, "If caller hasn't been specified during initialization, has to be specified during registration"
        assert executor or self.executor, "If executor hasn't been specified during initialization, has to be specified during registration"

        action_schemas = self.client.sdk.get_list_of_actions(
                                                actions=actions)
        
        for schema in action_schemas:
            self._register_schema_to_autogen(action_schema=schema,
                                            caller = caller if caller else self.caller,
                                            executor = executor if executor else self.executor)


    def _register_schema_to_autogen(self, 
                                    action_schema, 
                                    caller: ConversableAgent,
                                    executor: ConversableAgent):

        name = action_schema["name"]
        appName = action_schema["appName"]
        description = action_schema["description"]

        parameters = get_signature_format_from_schema_params(
                                            action_schema["parameters"])
        action_signature = Signature(parameters=parameters)
        
        placeholder_function = lambda **kwargs: self.client.execute_action(
                                                    self.client.get_action_enum(name, appName), 
                                                    kwargs)
        action_func = types.FunctionType(
                                    placeholder_function.__code__, 
                                    globals=globals(), 
                                    name=name, 
                                    closure=placeholder_function.__closure__
                          )
        action_func.__signature__ = action_signature
        action_func.__doc__ = description

        autogen.agentchat.register_function(
            action_func,
            caller=caller,
            executor=executor,
            name=name,
            description=description
        )