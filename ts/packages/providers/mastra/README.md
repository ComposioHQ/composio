# @composio/mastra

The Mastra provider turns Composio tools into Mastra's tool format with built-in execution, ready to pass to a Mastra `Agent`.

## Installation

```bash
npm install @composio/core @composio/mastra @mastra/core @ai-sdk/openai
```

Set `COMPOSIO_API_KEY` with your API key from [the dashboard](https://dashboard.composio.dev/settings), and `OPENAI_API_KEY` (or your LLM provider's key).

## Quickstart

Create a session for your user, fetch its tools, and hand them to an agent:

```typescript
import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';

const composio = new Composio({
  provider: new MastraProvider(),
});

// Create a session for your user
const session = await composio.sessions.create('user_123');
const tools = await session.tools();

const agent = new Agent({
  id: 'my-agent',
  name: 'My Agent',
  instructions: 'You are a helpful assistant.',
  model: openai('gpt-5.2'),
  tools,
});

const { text } = await agent.generate([
  {
    role: 'user',
    content:
      "Send an email to john@example.com with the subject 'Hello' and body 'Hello from Composio!'",
  },
]);

console.log(text);
```

Each tool gets both an input and an output schema, so Mastra can validate tool results as well as arguments.

## Strict mode

Pass `strict: true` to drop every non-required property from each tool's input schema before Mastra compiles it:

```typescript
const composio = new Composio({
  provider: new MastraProvider({ strict: true }),
});
```

## Links

- [Mastra provider docs](https://docs.composio.dev/docs/providers/mastra)
- [Composio documentation](https://docs.composio.dev)
