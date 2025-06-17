"""
Anthropic claude demo.7
"""

import anthropic

from composio import Composio
from composio_anthropic import AnthropicProvider


# Initialize tools.
anthropic_client = anthropic.Anthropic()
composio = Composio(provider=AnthropicProvider())

# Get GitHub tools that are pre-configured
tools = composio.tools.get(user_id="default", toolkits=["GITHUB"])

# Get response from the LLM
response = anthropic_client.messages.create(
    model="claude-3-opus-20240229",
    max_tokens=1024,
    tools=tools,
    messages=[
        {"role": "user", "content": "Star me composiohq/composio repo in github."},
    ],
)

# Execute the function calls.
result = composio.provider.handle_tool_calls(user_id="default", response=response)
print(result)
