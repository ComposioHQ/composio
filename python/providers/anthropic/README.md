# composio-anthropic

Adapts Composio tools to the Claude Messages API tool format and executes the tool calls Claude returns.

## Installation

```bash
pip install composio composio-anthropic anthropic
```

Set `COMPOSIO_API_KEY` (create one at https://dashboard.composio.dev/settings) and `ANTHROPIC_API_KEY` in your environment.

## Quickstart

`AnthropicProvider` is non-agentic: Claude returns `tool_use` blocks, `handle_tool_calls` executes them, and you send the results back as `tool_result` blocks.

```python
import json
import anthropic
from composio import Composio
from composio_anthropic import AnthropicProvider

composio = Composio(provider=AnthropicProvider())
client = anthropic.Anthropic()

# Create a session for your user
session = composio.create(user_id="user_123")
tools = session.tools()

messages = [
    {"role": "user", "content": "Send an email to john@example.com with the subject 'Hello' and body 'Hello from Composio!'"}
]

response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=4096,
    tools=tools,
    messages=messages,
)

# Agentic loop: keep executing tool calls until the model responds with text
while response.stop_reason == "tool_use":
    tool_use_blocks = [block for block in response.content if block.type == "tool_use"]
    results = composio.provider.handle_tool_calls(user_id="user_123", response=response)
    messages.append({"role": "assistant", "content": response.content})
    messages.append({
        "role": "user",
        "content": [
            {"type": "tool_result", "tool_use_id": tool_use_blocks[i].id, "content": json.dumps(result)}
            for i, result in enumerate(results)
        ]
    })
    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=4096,
        tools=tools,
        messages=messages,
    )

# Print final response
for block in response.content:
    if block.type == "text":
        print(block.text)
```

`handle_tool_calls` extracts every `tool_use` block from the response, executes the matching Composio tools, and returns the raw results in order. Claude occasionally emits tool input as a JSON string instead of an object; the provider normalizes this before execution.

Building on the Claude Agent SDK instead of the Messages API? Use [`composio-claude-agent-sdk`](../claude_agent_sdk).

## Links

- Anthropic provider docs: https://docs.composio.dev/docs/providers/anthropic
- Composio docs: https://docs.composio.dev
