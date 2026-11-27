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
    model="claude-opus-5-5",
    max_tokens=4096,
    tools=tools,
    messages=messages,
)

# Agentic loop: keep executing tool calls until the model responds with text
while response.stop_reason == "tool_use":
    # Results retain each tool_use ID; Python still needs explicit content blocks.
    results = composio.provider.handle_tool_calls(session=session, response=response)
    messages.append({"role": "assistant", "content": response.content})
    messages.append({
        "role": "user",
        "content": [
            {
                "type": "tool_result",
                "tool_use_id": result["tool_use_id"],
                "content": json.dumps(result),
                "is_error": not result["successful"],
            }
            for result in results
        ]
    })
    response = client.messages.create(
        model="claude-opus-5-5",
        max_tokens=4096,
        tools=tools,
        messages=messages,
    )

# Print final response
for block in response.content:
    if block.type == "text":
        print(block.text)
```

`handle_tool_calls` extracts every `tool_use` block, executes the matching Composio tools through the supplied session, and returns execution dictionaries in tool-use order. Pass `user_id` instead for tools fetched with `tools.get()`. Claude occasionally emits tool input as a JSON string instead of an object; the provider normalizes this before execution.

## Execution contracts

`execute_tool_call(session=session, tool_call=block)` returns one `AnthropicToolExecutionResponse`; `handle_tool_calls(session=session, response=response)` returns a list. Import both the provider and the response type from `composio_anthropic`.

Each result contains `tool_use_id`, `data`, `error`, and `successful`. Session-backed results also retain `result_type`, `log_id`, and `instant_charge` when returned. Check `result["successful"]` explicitly. A failed execution can have an empty or `None` error, and a log ID is only for correlation.

These are Python dictionaries, **not** Anthropic `tool_result` blocks. Serialize with `json.dumps(result)`, pair each block with `result["tool_use_id"]`, and set `is_error` from `not result["successful"]`, as above. Existing code that pairs the ordered results with the original `tool_use` blocks still works. TypeScript's `handleToolCalls` instead returns ready-to-append messages; don't use that contract in Python.

On older provider releases without `tool_use_id`, keep pairing the ordered results with the original `tool_use` blocks, as in the web guide. The correlation field is additive; the helper still returns execution dictionaries rather than native messages.

| Entry point | Arguments | Result and outcome check |
| --- | --- | --- |
| Python `session.execute` | `tool_slug=...`, `arguments={...}` | Pydantic model; `result.result_type == "completed"`. Use `model_dump(mode="json")` or `model_dump_json()` for serialization. No model call ID. |
| Python `composio.tools.execute` | `slug=...`, `arguments={...}`, `user_id=...` | `ToolExecutionResponse` dictionary; `result["successful"]`. |
| Python `after_execute` modifier | `(tool, toolkit, response)` | Receives and returns a `ToolExecutionResponse` dictionary; check `response["successful"]`, not an attribute. |
| Python Anthropic helpers | `session=...` **or** `user_id=...`; `tool_call=...` or `response=...` | Correlated execution dictionaries; `result["successful"]`. |

Session adapters derive `successful` from `result_type == "completed"`; `"failed"` and `"blocked"` are not successful. `session.execute` itself doesn't run `session.tools(modifiers=...)` callbacks. Direct-execution modifiers can't be passed alongside a session to a provider helper.

Transport, authentication, and input errors can raise instead of returning a tool result. Handle credential/connection recovery separately from an ordinary returned failure. If a batch raises, earlier calls may already have executed. Don't replay the batch blindly. The execution status, an empty error, or a log ID alone doesn't establish a provider-side side effect; inspect the tool-specific `data`. Retry and idempotency policy stays in your application.

Building on the Claude Agent SDK instead of the Messages API? Use [`composio-claude-agent-sdk`](../claude_agent_sdk).

## Links

- Anthropic provider docs: https://docs.composio.dev/docs/providers/anthropic
- Composio docs: https://docs.composio.dev
