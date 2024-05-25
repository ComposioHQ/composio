"""
OpenAI demo.
"""

import dotenv
from composio_openai import App, ComposioToolset
from openai import OpenAI


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tools.
openai_client = OpenAI()
composio_toolset = ComposioToolset()

# Define task.
task = "Star a repo SamparkAI/composio_sdk on GitHub"

# Get GitHub tools that are pre-configured
tools = composio_toolset.get_tools(tools=[App.GITHUB])

# Get response from the LLM
response = openai_client.chat.completions.create(
    model="gpt-4-turbo-preview",
    tools=tools,
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": task},
    ],
)
print(response)

# Execute the function calls.
result = composio_toolset.handle_calls(response)
print(result)
