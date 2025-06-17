"""
OpenAI demo.
"""

from openai import OpenAI
from composio import Composio
from composio_openai import OpenAIProvider


# Initialize tools.
openai_client = OpenAI()
composio = Composio(provider=OpenAIProvider())

# Define task.
task = "Star a repo composiohq/composio on GitHub"

# Get GitHub tools that are pre-configured
tools = composio.tools.get(user_id="default", toolkits=["GITHUB"])

# Get response from the LLM
response = openai_client.chat.completions.create(
    model="gpt-4o-mini",
    tools=tools,
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": task},
    ],
)
print(response)

# Execute the function calls.
result = composio.provider.handle_tool_calls(response=response, user_id="default")
print(result)

