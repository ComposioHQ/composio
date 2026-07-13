# @composio/llamaindex

The LlamaIndex provider turns Composio tools into LlamaIndex tools that execute themselves, ready to hand to a LlamaIndex agent.

## Installation

```bash
npm install @composio/core @composio/llamaindex @llamaindex/openai @llamaindex/workflow
```

Set `COMPOSIO_API_KEY` with your API key from [the dashboard](https://dashboard.composio.dev/settings), and `OPENAI_API_KEY` (or your LLM provider's key).

## Quickstart

Create a session for your user, fetch its tools, and hand them to an agent:

```typescript
import { Composio } from '@composio/core';
import { LlamaindexProvider } from '@composio/llamaindex';
import { openai } from '@llamaindex/openai';
import { agent } from '@llamaindex/workflow';

const composio = new Composio({
  provider: new LlamaindexProvider(),
});

// Create a session for your user
const session = await composio.sessions.create('user_123');
const tools = await session.tools();

const myAgent = agent({
  llm: openai({ model: 'gpt-5.2' }),
  tools,
});

const result = await myAgent.run(
  "Send an email to john@example.com with the subject 'Hello' and body 'Hello from Composio!'"
);

console.log(result.data.result);
```

The provider converts each tool's JSON Schema parameters to Zod and wires execution through Composio, so LlamaIndex can call the tools directly.

## Links

- [LlamaIndex provider docs](https://docs.composio.dev/docs/providers/llamaindex)
- [Composio documentation](https://docs.composio.dev)
