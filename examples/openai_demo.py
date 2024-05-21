from pprint import pprint

import dotenv
from composio_openai import App, ComposioToolset
from openai import OpenAI


# Loading the variables from .env file
dotenv.load_dotenv()

openai_client = OpenAI()

toolset = ComposioToolset()
actions = toolset.get_tools(tools=App.GITHUB)
# pprint(actions)

my_task = "Star a repo SamparkAI/composio_sdk on GitHub"

# Create a chat completion request to decide on the action
response = openai_client.chat.completions.create(
    model="gpt-4-turbo-preview",
    tools=actions,  # Passing actions we fetched earlier.
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": my_task},
    ],
)

pprint(response)

result = toolset.handle_tool_calls(response)
pprint(result)
