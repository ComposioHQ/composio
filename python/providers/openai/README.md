# composio-openai

Adapts Composio tools to OpenAI function calling, for both the Responses API and the Chat Completions API.

## Installation

```bash
pip install composio composio-openai openai
```

Set `COMPOSIO_API_KEY` (create one at https://dashboard.composio.dev/settings) and `OPENAI_API_KEY` in your environment.

## Quickstart

This package exports two providers: `OpenAIResponsesProvider` for the [Responses API](https://platform.openai.com/docs/api-reference/responses) and `OpenAIProvider` for Chat Completions. Both are non-agentic: the model returns tool calls, you execute them with `handle_tool_calls`, and you feed the results back.

```python
import json
from openai import OpenAI
from composio import Composio
from composio_openai import OpenAIResponsesProvider

composio = Composio(provider=OpenAIResponsesProvider())
client = OpenAI()

# Create a session for your user
session = composio.create(user_id="user_123")
tools = session.tools()

response = client.responses.create(
    model="gpt-5.2",
    tools=tools,
    input=[
        {
            "role": "user",
            "content": "Send an email to john@example.com with the subject 'Hello' and body 'Hello from Composio!'"
        }
    ]
)

# Agentic loop: keep executing tool calls until the model responds with text
while True:
    tool_calls = [o for o in response.output if o.type == "function_call"]
    if not tool_calls:
        break
    results = composio.provider.handle_tool_calls(response=response, user_id="user_123")
    response = client.responses.create(
        model="gpt-5.2",
        tools=tools,
        previous_response_id=response.id,
        input=[
            {"type": "function_call_output", "call_id": tool_calls[i].call_id, "output": json.dumps(result)}
            for i, result in enumerate(results)
        ]
    )

# Print final response
for item in response.output:
    if item.type == "message":
        print(item.content[0].text)
```

## Chat Completions

`OpenAIProvider` targets `client.chat.completions.create` and is the Composio SDK default, so `Composio()` with no provider uses it. The loop is the same shape: call `handle_tool_calls` on each response, append the results as `tool` messages, and call the API again. See the [docs page](https://docs.composio.dev/docs/providers/openai) for the full example.

## Links

- OpenAI provider docs: https://docs.composio.dev/docs/providers/openai
- Composio docs: https://docs.composio.dev
