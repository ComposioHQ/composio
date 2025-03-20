from computer_agent import Computer_Agent
from computer import LocalPlaywrightComputer
from composio_openai_agents import ComposioToolSet, App, Action, Trigger
from agents import Agent, Runner, ComputerTool, function_tool
from openai import OpenAI
from dotenv import load_dotenv

from composio.client.collections import TriggerEventData

load_dotenv()

toolset = ComposioToolSet()

client = OpenAI()

tools = toolset.get_tools(apps=[App.SLACK])
listener = toolset.create_trigger_listener()

@listener.callback(filters={"trigger_name": "SLACK_RECEIVE_MESSAGE"})
def browser_agent(event: TriggerEventData) -> list:
    """Research stock information using browser automation step by step."""
    payload = event.payload
    print('Payload recieved')
    user_input = payload['text']
    if user_input.startswith('Browser-agent:'):
        print('Skipping browser-agent message')
        return []
        
    with LocalPlaywrightComputer() as computer:
        agent = Computer_Agent(computer=computer)

        step_items = [{"role": "user", "content": "This is what the user wants:"+user_input+". Execute his request but speed is off most importance, do the task in the quickest way possible, do not ask questions"}]
        output_items = agent.run_full_turn(step_items, debug=True, show_images=False)
        print("OUTPUT_ITEMS:",output_items)
        res = toolset.execute_action(
            Action.SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL,
            params={
                'channel':payload['channel'],
                'text':"Browser-agent:"+str(output_items[-1]['content'][0]['text'])
            }
        )

print('Listening')
listener.wait_forever() 
