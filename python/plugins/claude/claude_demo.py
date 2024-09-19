"""
Anthropic claude demo.7
"""

import anthropic
import dotenv

from composio_claude import App, ComposioToolSet


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tools.
claude_client = anthropic.Anthropic()
composio_toolset = ComposioToolSet()

# Define task.
task = "Star a repo composiohq/composio on GitHub"

# Get GitHub tools that are pre-configured
actions = composio_toolset.get_tools(apps=[App.GITHUB])

# Get executor
try:
    # anthropic<0.27.0
    executor = claude_client.beta.tools
except AttributeError:
    # anthropic>=0.27.0
    executor = claude_client


# Get response from the LLM
response = executor.messages.create(
    model="claude-3-opus-20240229",
    max_tokens=1024,
    tools=actions,
    messages=[
        {"role": "user", "content": "Star me composiohq/composio repo in github."},
    ],
)

# Execute the function calls.
result = composio_toolset.handle_tool_calls(llm_response=response)
print(result)
