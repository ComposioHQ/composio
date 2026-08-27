# @composio/openai-agents

Composio provider for the [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/) (`@openai/agents`). It converts Composio tools into the Agents SDK's native tool format so your agents can act across 1000+ apps.

## Installation

```bash
npm install @composio/core @composio/openai-agents @openai/agents
```

Set two environment variables:

- `COMPOSIO_API_KEY` from the [Composio dashboard](https://dashboard.composio.dev/settings)
- `OPENAI_API_KEY` from [OpenAI](https://platform.openai.com/api-keys)

## Quickstart

Create a session for your user, hand its tools to an agent, and run it:

```typescript
import { Composio } from '@composio/core';
import { OpenAIAgentsProvider } from '@composio/openai-agents';
import { Agent, run } from '@openai/agents';

const composio = new Composio({ provider: new OpenAIAgentsProvider() });

// Each session is scoped to one of your users
const session = await composio.create('user_123');
const tools = await session.tools();

const agent = new Agent({
  name: 'Personal Assistant',
  instructions: 'You are a helpful personal assistant. Use Composio tools to take action.',
  model: 'gpt-5.2',
  tools,
});

const result = await run(agent, 'Summarize my emails from today');
console.log(result.finalOutput);
```

For multi-turn conversations, store `session.sessionId` and reuse it with `composio.use(sessionId)` instead of creating a new session each turn.

## Strict mode

Pass `strict: true` to register tools with strict JSON schema validation (see the [Agents SDK options reference](https://openai.github.io/openai-agents-js/guides/tools/#options-reference)). Each tool's input schema is normalized for OpenAI structured outputs: every object lists all of its properties in `required` and is closed, and optional properties stay available but accept `null`. A `null` is dropped before the tool runs unless the tool's own schema accepts `null` for that parameter, so nullable fields still receive an explicit `null`. Tools whose schema cannot be expressed in strict mode, such as objects that accept arbitrary keys, `allOf`, `prefixItems`, or unresolved `$ref`s, are registered without strict mode and log a warning:

```typescript
const provider = new OpenAIAgentsProvider({ strict: true });
```

## Links

- [Composio quickstart](https://docs.composio.dev/docs/quickstart)
- [Composio documentation](https://docs.composio.dev)
- [OpenAI Agents SDK documentation](https://openai.github.io/openai-agents-js/)
