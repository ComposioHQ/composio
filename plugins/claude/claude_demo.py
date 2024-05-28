"""
Anthropic claude demo.
"""

import anthropic
import dotenv
from composio_claude import App, ComposioToolset


# Load environment variables from .env
dotenv.load_dotenv()

# Initialize tools.
claude_client = anthropic.Anthropic()
composio_toolset = ComposioToolset()

# Define task.
task = "Star a repo SamparkAI/composio_sdk on GitHub"

# Get GitHub tools that are pre-configured
actions = composio_toolset.get_tools(apps=[App.GITHUB])

# Get response from the LLM
response = claude_client.beta.tools.messages.create(
    model="claude-3-opus-20240229",
    max_tokens=1024,
    tools=actions,
    messages=[
        {"role": "user", "content": "Star me SamparkAI/composio repo in github."},
    ],
)

# Execute the function calls.
result = composio_toolset.handle_tool_calls(llm_response=response)
print(result)
