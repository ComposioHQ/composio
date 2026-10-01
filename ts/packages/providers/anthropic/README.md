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
  model: 'claude-opus-4-6',
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
    model: 'claude-opus-4-6',
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

- `cacheTools`: pass `new AnthropicProvider({ cacheTools: true })` to attach Anthropic's ephemeral `cache_control` to your tool definitions and tool-result blocks, letting Claude reuse cached tool schemas and results across requests. Anthropic caps requests at 4 `cache_control` breakpoints total (shared with the system prompt and messages), and a breakpoint caches everything up to and including it, so `wrapTools`/`handleToolCalls` each place a single breakpoint on the last tool/result rather than one per item — this still caches the whole batch with one breakpoint. It is the only constructor option.
- `handleToolCalls(session, message)` returns `Anthropic.Messages.MessageParam[]`, not raw strings, so you append the result directly to your message list. Pass a user ID instead of a session for tools fetched with `tools.get()`. For finer control, `executeToolCall(session, toolUseBlock)` runs a single `tool_use` block and returns the result as a JSON string.
- Claude occasionally emits a tool's `input` as a JSON string instead of an object; the provider normalizes this before execution.

## Links

- [Anthropic provider docs](https://docs.composio.dev/docs/providers/anthropic)
- [Composio documentation](https://docs.composio.dev)
