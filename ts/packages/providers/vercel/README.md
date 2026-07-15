# @composio/vercel

Composio provider for the [Vercel AI SDK](https://sdk.vercel.ai) (`ai`). It converts Composio tools into the AI SDK's tool format with built-in execution: each wrapped tool carries its own `execute` function, so the AI SDK runs tool calls for you without a manual agentic loop.

## Installation

```bash
npm install @composio/core @composio/vercel ai @ai-sdk/anthropic
```

`@ai-sdk/anthropic` powers the example below; swap in any AI SDK model package.

Set two environment variables:

- `COMPOSIO_API_KEY` from the [Composio dashboard](https://dashboard.composio.dev/settings)
- `ANTHROPIC_API_KEY` from [Anthropic](https://console.anthropic.com/settings/keys) (or the key for your chosen model provider)

## Quickstart

Create a session for your user, pass its tools to the AI SDK, and cap the run with `stopWhen`:

```typescript
import { anthropic } from '@ai-sdk/anthropic';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { generateText, stepCountIs } from 'ai';

const composio = new Composio({ provider: new VercelProvider() });

// Each session is scoped to one of your users
const session = await composio.create('user_123');
const tools = await session.tools();

const { text } = await generateText({
  model: anthropic('claude-sonnet-4-6'),
  tools,
  prompt: 'Summarize my emails from today',
  stopWhen: stepCountIs(10),
});

console.log(text);
```

For multi-turn conversations, store `session.sessionId` and reuse it with `composio.use(sessionId)` instead of creating a new session each turn.

## Strict mode

Some models reject tool schemas that contain optional parameters. Pass `strict: true` to drop every non-required property from each tool's input schema before it reaches the AI SDK:

```typescript
const composio = new Composio({ provider: new VercelProvider({ strict: true }) });
```

## Links

- [Vercel AI SDK provider docs](https://docs.composio.dev/docs/providers/vercel)
- [Composio quickstart](https://docs.composio.dev/docs/quickstart)
- [Composio documentation](https://docs.composio.dev)
