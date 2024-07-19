"""
OpenAI demo.
"""

import dotenv
from openai import OpenAI

from composio_openai import Action, App, ComposioToolSet


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tools.
openai_client = OpenAI()
composio_toolset = ComposioToolSet()

# Define task.
task = "Star a repo composiohq/composio on GitHub"

# Get GitHub tools that are pre-configured
tools = composio_toolset.get_tools(apps=[App.GITHUB])

# Extension of system prompt(Not using at this moment)
_ = composio_toolset.get_agent_instructions(
    apps=[App.GMAIL],
    actions=[
        Action.MATHEMATICAL_CALCULATOR,
    ],
)

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
result = composio_toolset.handle_tool_calls(response)
print(result)
