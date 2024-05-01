
import json
from json.decoder import JSONDecoder
from composio import FrameworkEnum
from composio_openai import OpenaiStyleToolsetBase

from julep.api.types import ChatResponse
        
class ComposioToolset(OpenaiStyleToolsetBase):
    def __init__(self, *args, framework=FrameworkEnum.JULEP, **kwargs):
        super().__init__(*args, framework=framework, **kwargs)
        
    
    def handle_tool_calls(self,
                          llm_response: ChatResponse, 
                          entity_id: str = "default") -> list[any]:
        outputs = []        
        entity = self.client.sdk.get_entity(entity_id)
        
        for responses in llm_response.response:
            for response in responses:
                try:
                    function = json.loads(response.content)
                    action_name_to_execute = function["name"]
                    action = self.client.sdk.get_action_enum_without_tool(
                        action_name=action_name_to_execute
                    )
                    arguments = json.loads(function["arguments"])
                    account = entity.get_connection(app_name=action.service)
                    output = account.execute_action(action, arguments)
                    
                except json.JSONDecodeError:
                    output = response.content
                    
                outputs.append(output)

        return outputs
    


if __name__ == '__main__':
    from pprint import pprint
    from composio import App
    
    toolset = ComposioToolset()
    out = toolset.get_tools(tools=App.GITHUB)
    pprint(out)
