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

Pass `strict: true` to rewrite each tool's input schema into the form OpenAI strict mode (structured outputs) accepts before it reaches the AI SDK: every object lists all of its properties in `required` and is closed, and optional properties stay available but accept `null`. A `null` is dropped before the tool runs unless the tool's own schema accepts `null` for that parameter, so nullable fields still receive an explicit `null`. Tools whose schema cannot be expressed in strict mode, such as objects that accept arbitrary keys, `allOf`, `prefixItems`, or unresolved `$ref`s, keep their original schema and log a warning:

```typescript
const composio = new Composio({ provider: new VercelProvider({ strict: true }) });
```

The option does not set the AI SDK's per-tool `strict` flag, so the model provider does not enforce the schema. It does change what the provider accepts locally: tool-call arguments are validated against the rewritten schema, so a call that leaves out an optional parameter instead of sending `null` fails validation, and those `null`s are dropped before the tool runs, as described above. If you set that flag yourself, use it only with OpenAI models and only on tools that did not log the warning above, since OpenAI rejects a tool that kept its original schema. Don't set it for Anthropic models: Anthropic strict mode allows at most 16 parameters with union types and 24 optional parameters across all strict tools in a request, and the rewrite turns every optional parameter into a union, so a request with about ten Composio tools is rejected. Anthropic strict mode also rejects recursive definitions and keywords such as `minimum` and `maximum` that some Composio tools use.

## Tool schemas

The provider passes each tool's JSON Schema to the AI SDK with `jsonSchema()`, so the model sees it as is, including keywords such as `format`, `contentEncoding`, and `contentMediaType`. Internal `$ref`s are inlined first. Tool-call arguments are validated with a Zod schema built from the same JSON Schema. In strict mode the model sees the strict rewrite instead, which drops string formats strict structured outputs reject.

## Links

- [Vercel AI SDK provider docs](https://docs.composio.dev/docs/providers/vercel)
- [Composio quickstart](https://docs.composio.dev/docs/quickstart)
- [Composio documentation](https://docs.composio.dev)
