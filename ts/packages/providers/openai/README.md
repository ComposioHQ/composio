# @composio/openai

Adapts Composio tools to OpenAI function calling, for both the Responses API and the Chat Completions API.

## Installation

```bash
npm install @composio/core @composio/openai openai
```

Set `COMPOSIO_API_KEY` (create one at https://dashboard.composio.dev/settings) and `OPENAI_API_KEY` (from https://platform.openai.com/api-keys) in your environment.

## Quickstart

Create a session for your user, pass its tools to the Responses API, and run the tool-call loop until the model replies with text. `handleToolCalls` executes the tool calls and returns ready-to-send `function_call_output` items.

```typescript
import OpenAI from 'openai';
import { Composio } from '@composio/core';
import { OpenAIResponsesProvider } from '@composio/openai';

const composio = new Composio({
  provider: new OpenAIResponsesProvider(),
});
const client = new OpenAI();

// Create a session for your user
const session = await composio.sessions.create('user_123');
const tools = await session.tools();

let response = await client.responses.create({
  model: 'gpt-5.2',
  tools,
  input: [
    {
      role: 'user',
      content:
        "Send an email to john@example.com with the subject 'Hello' and body 'Hello from Composio!'",
    },
  ],
});

// Agentic loop: keep executing tool calls until the model responds with text
while (response.output.some(o => o.type === 'function_call')) {
  const results = await composio.provider.handleToolCalls('user_123', response.output);
  response = await client.responses.create({
    model: 'gpt-5.2',
    tools,
    previous_response_id: response.id,
    input: results,
  });
}

// Print final response
for (const item of response.output) {
  if (item.type === 'message' && item.content[0].type === 'output_text') {
    console.log(item.content[0].text);
  }
}
```

## Providers in this package

The package exports one provider per API surface:

- `OpenAIResponsesProvider` targets the Responses API. `handleToolCalls(userId, response.output)` returns `function_call_output` items keyed by `call_id`; pair it with `previous_response_id` so you only resend new outputs each turn. The constructor accepts `{ strict?: boolean }` to enforce strict function schemas (default `false`).
- `OpenAIProvider` targets the Chat Completions API and is the Composio SDK default, so `new Composio()` with no provider uses it. `handleToolCalls(userId, chatCompletion)` returns ready-to-append `tool` messages; you keep the full message list yourself.

Use the Responses provider for new agentic flows; reach for Chat Completions when extending an existing Chat Completions codebase. See the [docs page](https://docs.composio.dev/docs/providers/openai) for the Chat Completions loop.

## Links

- [OpenAI provider docs](https://docs.composio.dev/docs/providers/openai)
- [Composio documentation](https://docs.composio.dev)
