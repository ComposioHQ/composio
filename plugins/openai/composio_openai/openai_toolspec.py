import hashlib
import logging
import os
import json
import types
from inspect import Signature
from typing import List, Union
from openai.types.chat.chat_completion import ChatCompletion

from composio.sdk import format_schema, SchemaFormat
from composio import Action, App, ComposioCore, FrameworkEnum, Tag

logger = logging.getLogger(__name__)


class OpenaiStyleToolsetBase:
    def __init__(self, framework = None, entity_id: str = "default", schema_format = SchemaFormat.OPENAI):
        self.entity_id = entity_id
        self.client = ComposioCore(
                            framework=framework, api_key=os.environ.get("COMPOSIO_API_KEY", None)
                            )
        self.schema_format = schema_format

    def get_actions(self, actions: Union[Action, List[Action]]):
        if isinstance(actions, Action):
            actions = [actions]
        
        action_schemas = self.client.sdk.get_list_of_actions(actions=actions)
        
        formatted_schemas = [format_schema(action_schema, 
                                           format=self.schema_format) for action_schema in action_schemas]
        return formatted_schemas
    
    def get_tools(self, 
        tools: Union[App, List[App]],
        tags: List[Union[str, Tag]] = None):
        if isinstance(tools, App):
            tools = [tools]
        
        action_schemas = self.client.sdk.get_list_of_actions(apps=tools, 
                                                             tags=tags)
        formatted_schemas = [format_schema(action_schema, 
                                           format=self.schema_format) for action_schema in action_schemas]
        return formatted_schemas
    

        
        
class ComposioToolset(OpenaiStyleToolsetBase):
    def __init__(self, *args, framework=FrameworkEnum.OPENAI, **kwargs):
        super().__init__(*args, framework=framework, **kwargs)

    def handle_tool_calls(self,
                          llm_response: ChatCompletion, 
                          entity_id: str = "default") -> list[any]:
        output = []        
        entity = self.client.sdk.get_entity(entity_id)
        try:
            if llm_response.choices:
                for choice in llm_response.choices:
                    if choice.message.tool_calls:
                        for tool_call in choice.message.tool_calls:
                            action_name_to_execute = tool_call.function.name
                            action = self.client.sdk.get_action_enum_without_tool(
                                action_name=action_name_to_execute
                            )
                            arguments = json.loads(tool_call.function.arguments)
                            account = entity.get_connection(app_name=action.service)
                            output.append(account.execute_action(action, arguments))

        except Exception as e:
            raise e from e

        return output

if __name__ == '__main__':
    from pprint import pprint
    
    toolset = ComposioToolset()
    out = toolset.get_tools(tools=App.GITHUB)
    pprint(out)
