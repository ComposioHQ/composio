import os
import logging
from typing import List, Union
from schema import Schema, Literal
from griptape.tools import BaseTool
from griptape.utils.decorators import activity
from griptape.artifacts import BaseArtifact

from composio.sdk import SchemaFormat
from composio.sdk.shared_utils import schema_type_python_type_dict
from composio import Action, App, ComposioCore, FrameworkEnum, Tag

logger = logging.getLogger(__name__)


class ComposioToolset:
    def __init__(self, framework = FrameworkEnum.GRIPTAPE, entity_id: str = "default"):
        self.entity_id = entity_id
        self.client = ComposioCore(
                            framework=framework, api_key=os.environ.get("COMPOSIO_API_KEY", None)
                            )

    def get_actions(self, actions: Union[Action, List[Action]]):
        if isinstance(actions, Action):
            actions = [actions]
        
        action_schemas = self.client.sdk.get_list_of_actions(actions=actions)
        

        formatted_schemas = [self.action_schema_to_griptape(action_schema)() 
                             for action_schema in action_schemas]
        return formatted_schemas
    
    def get_tools(self, 
        tools: Union[App, List[App]],
        tags: List[Union[str, Tag]] = None):
        if isinstance(tools, App):
            tools = [tools]
        
        action_schemas = self.client.sdk.get_list_of_actions(apps=tools, 
                                                             tags=tags)
        formatted_schemas = [self.action_schema_to_griptape(action_schema)() 
                             for action_schema in action_schemas]
        return formatted_schemas
    
    def action_schema_to_griptape(self, action_schema):

        schema_dict = {}
        name = action_schema["name"]
        appName = action_schema["appName"]
        description = action_schema["description"]

        for param_name, param_body in action_schema["parameters"]["properties"].items():
            description =param_body["description"] 
            dtype = param_body["type"]

            schema_key = Literal(param_name, description=description)
            if dtype in schema_type_python_type_dict:
                schema_dtype = schema_type_python_type_dict.get(dtype)
            elif dtype == "array":
                schema_array_dtype = schema_type_python_type_dict.get(param_body["items"].get("type"), None)
                schema_dtype = list[schema_array_dtype] if schema_array_dtype else list
            else:
                raise TypeError(f"Some dtype of current schema are not handled yet. Current Schema: {param_body}")
            
            schema_dict[schema_key] = schema_dtype

        griptape_activity_config = {
            "description": description,
            "schema": Schema(schema_dict),
        }

        class tool_class(BaseTool):
            @activity(
                config=griptape_activity_config
            )
            def execute_task(nested_self, params: dict):
                print(params)
                params_dict = params["values"]
                return self.client.execute_action(
                            self.client.get_action_enum(name, appName), 
                            params_dict, 
                            entity_id= self.entity_id
                        )
            
            @property
            def manifest(self) -> dict:
                return {
                    'version': 'v1',
                    'name': name,
                    'description': description,
                    'contact_email': 'hello@composio.dev',
                    'legal_info_url': 'https://www.composio.dev/legal'
                    }

        griptape_tool_class = type(f"{name}_client", (tool_class,), {})

        # setattr(griptape_tool_class, 'execute_task', execute_task)
        # setattr(griptape_tool_class, 'manifest', manifest)

        return griptape_tool_class



    

        
        
# class ComposioToolset(OpenaiStyleToolsetBase):
#     def __init__(self, *args, framework=FrameworkEnum.OPENAI, **kwargs):
#         super().__init__(*args, framework=framework, **kwargs)

#     def handle_tool_calls(self,
#                           llm_response: ChatCompletion, 
#                           entity_id: str = "default") -> list[any]:
#         output = []        
#         entity = self.client.sdk.get_entity(entity_id)
#         try:
#             if llm_response.choices:
#                 for choice in llm_response.choices:
#                     if choice.message.tool_calls:
#                         for tool_call in choice.message.tool_calls:
#                             action_name_to_execute = tool_call.function.name
#                             action = self.client.sdk.get_action_enum_without_tool(
#                                 action_name=action_name_to_execute
#                             )
#                             arguments = json.loads(tool_call.function.arguments)
#                             account = entity.get_connection(app_name=action.service)
#                             output.append(account.execute_action(action, arguments))

#         except Exception as e:
#             raise e from e

#         return output

if __name__ == '__main__':
    from pprint import pprint
    
    toolset = ComposioToolset()
    out = toolset.get_tools(tools=App.GITHUB)
    pprint(out)
