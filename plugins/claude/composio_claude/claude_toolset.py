
import json
from json.decoder import JSONDecoder
from composio import FrameworkEnum
from composio.sdk import SchemaFormat
from composio_openai import OpenaiStyleToolsetBase

from anthropic.types.beta.tools import ToolUseBlock, ToolsBetaMessage
        
class ComposioToolset(OpenaiStyleToolsetBase):
    def __init__(self, *args, framework=FrameworkEnum.CLAUDE, schema_format = SchemaFormat.CLAUDE, **kwargs):
        super().__init__(*args, framework=framework, schema_format=schema_format, **kwargs)
    
    
    def handle_tool_calls(self,
                          llm_response: ToolsBetaMessage, 
                          entity_id: str = "default") -> list[any]:
        outputs = []        
        entity = self.client.sdk.get_entity(entity_id)
        
        for content in llm_response.content:
            if isinstance(content, ToolUseBlock):
                action_name_to_execute = content.name
                arguments = content.input


                action = self.client.sdk.get_action_enum_without_tool(
                    action_name=action_name_to_execute
                )
                account = entity.get_connection(app_name=action.service)
                output = account.execute_action(action, arguments)
                outputs.append(output)
        if outputs == []:
            print("No tool call present in Claude Response")

        return outputs
    


if __name__ == '__main__':
    from pprint import pprint
    from composio import App
    
    toolset = ComposioToolset()
    out = toolset.get_tools(tools=App.GITHUB)
    pprint(out)
