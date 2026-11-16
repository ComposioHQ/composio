# @composio/anthropic

Adapts Composio tools to the Claude Messages API and executes the tool calls Claude returns.

## Installation

```bash
npm install @composio/core @composio/anthropic @anthropic-ai/sdk
```

Set `COMPOSIO_API_KEY` (create one at https://dashboard.composio.dev/settings) and `ANTHROPIC_API_KEY` (from https://console.anthropic.com/settings/keys) in your environment.

## Quickstart

Create a session for your user, pass its tools to the Messages API, and run the tool-call loop until Claude replies with text. `handleToolCalls` executes every `tool_use` block and returns a ready-to-append `user` message of `tool_result` blocks.

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';

const composio = new Composio({
  provider: new AnthropicProvider(),
});
const client = new Anthropic();

// Create a session for your user
const session = await composio.create('user_123');
const tools = await session.tools();

const messages: Anthropic.MessageParam[] = [
  {
    role: 'user',
    content:
      "Send an email to john@example.com with the subject 'Hello' and body 'Hello from Composio!'",
  },
];

let response = await client.messages.create({
  model: 'claude-opus-5-5',
  max_tokens: 4096,
  tools,
  messages,
});

// Agentic loop: keep executing tool calls until the model responds with text
while (response.stop_reason === 'tool_use') {
  const toolResults = await composio.provider.handleToolCalls(session, response);
  messages.push({ role: 'assistant', content: response.content });
  messages.push(...toolResults);
  response = await client.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 4096,
    tools,
    messages,
  });
}

// Print final response
for (const block of response.content) {
  if (block.type === 'text') {
    console.log(block.text);
  }
}
```

Building on the Claude Agent SDK instead? Use [`@composio/claude-agent-sdk`](../claude-agent-sdk), which exposes Composio tools as an in-process MCP server and lets the SDK run the loop.

## Provider options

- `cacheTools`: pass `new AnthropicProvider({ cacheTools: true })` to attach Anthropic's ephemeral `cache_control` to your tool definitions, letting Claude reuse the cached tool schemas across requests. It is the only constructor option.
  - Anthropic allows at most 4 `cache_control` breakpoints per request, shared across the system prompt, tools, and messages. A breakpoint caches everything up to and including it, so `wrapTools` places one breakpoint on the last tool instead of one per tool. Tool-result blocks from `handleToolCalls` are never marked, because you append them to the message list every turn and their breakpoints would pile up.
  - The cap applies to the whole request, not to a single call. If you merge the results of several `wrapTools` calls (for example from several `tools.get()` calls), each list's last tool carries a breakpoint, so keep the total within the limit.
- `handleToolCalls(session, message)` returns `Anthropic.Messages.MessageParam[]`, not raw strings, so you append the result directly to your message list. Pass a user ID instead of a session for tools fetched with `tools.get()`. For finer control, `executeToolCall(session, toolUseBlock)` runs a single `tool_use` block and returns the result as a JSON string.
- Claude occasionally emits a tool's `input` as a JSON string instead of an object; the provider normalizes this before execution.

## Execution contracts

| Entry point | Arguments | Return value |
| --- | --- | --- |
| `session.execute` | `toolSlug`, `arguments` | Plain object with `resultType`, `data`, `error`, and `logId`. Check `result.resultType === 'completed'`; serialize with `JSON.stringify(result)`. |
| `composio.tools.execute` | `toolSlug`, `{ arguments, userId }` | `ToolExecuteResponse`; check `result.successful`. |
| `afterExecute` modifier | `{ toolSlug, toolkitSlug, result }` | Receives and returns `ToolExecuteResponse`; check `result.successful`. |
| `executeToolCall` | `session, toolUse` or `userId, toolUse, options?, modifiers?` | JSON string: `data` when `error === null`, otherwise `{ error }`. |
| `handleToolCalls` | `session, message` or `userId, message, options?, modifiers?` | `Anthropic.Messages.MessageParam[]`: a `user` message containing ordered `tool_result` blocks, or `[]` when there are no tool uses. |

`handleToolCalls` sets each block's `tool_use_id` from the original `tool_use.id`. It doesn't include the full execution metadata or an `is_error` flag; its serialized content is **not** an explicit success discriminator. If your application needs to inspect execution outcomes, use `session.execute` or direct execution and retain the model call ID when building your own message blocks. Python's `handle_tool_calls` returns execution dictionaries instead of TypeScript-native messages.

Session adapters derive `successful` from `resultType === 'completed'`. A failed execution can have an empty or `null` error. A log ID is for correlation, not proof of a provider-side side effect. Check the explicit status and tool-specific `data`. Transport/authentication errors can throw; handle authentication recovery separately from returned execution failures. A batch can stop after earlier calls have run, so don't blindly replay it. Retry and idempotency decisions remain yours.

## Links

- [Anthropic provider docs](https://docs.composio.dev/docs/providers/anthropic)
- [Composio documentation](https://docs.composio.dev)
