"""
OpenAI demo.
"""

import dotenv
from composio_openai import Action, App, ComposioToolSet
from openai import OpenAI


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tools.
openai_client = OpenAI()
composio_toolset = ComposioToolSet()

# Define task.
task = "Star a repo SamparkAI/composio_sdk on GitHub"

# Get GitHub tools that are pre-configured
tools = composio_toolset.get_tools(apps=[App.GITHUB])

# Extension of system prompt(Not using at this moment)
_ = composio_toolset.get_agent_instructions(
    apps=[App.GMAIL],
    actions=[
        Action.GITHUB_ADD_A_SECURITY_MANAGER_TEAM,
        Action.ASANA_SEARCH_TASKS_IN_A_WORKSPACE,
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
