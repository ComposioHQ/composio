# @composio/openai-agents

The OpenAI Agents API provider for Composio SDK, providing seamless integration with OpenAI's Agents API and tools.

## Features

- **OpenAI Agents Integration**: Seamless integration with OpenAI's Agents SDK
- **Tool Integration**: Easy integration of Composio tools with OpenAI Agents
- **Type Safety**: Full TypeScript support with proper type definitions
- **Strict Mode**: Support for strict mode tool parameter validation

## Installation

```bash
npm install @composio/openai-agents @openai/agents
# or
yarn add @composio/openai-agents @openai/agents
# or
pnpm add @composio/openai-agents @openai/agents
```

## Environment Variables

Required environment variables:

- `COMPOSIO_API_KEY`: Your Composio API key
- `OPENAI_API_KEY`: Your OpenAI API key

## Example

```typescript
import { OpenAIAgentsProvider } from '@composio/openai-agents';
import { Composio } from '@composio/core';
import { Agent, run } from '@openai/agents';

const composio = new Composio({
  provider: new OpenAIAgentsProvider(),
});

// Fetch tools from Composio
const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER', {
  beforeExecute: async (toolSlug, toolkitSlug, params) => {
    console.log(`🔄 Executing tool ${toolSlug} from toolkit ${toolkitSlug}...`);
    return params;
  },
  afterExecute: async (toolSlug, toolkitSlug, result) => {
    console.log(`✅ Tool ${toolSlug} executed`);
    return result;
  },
});

// Create an agent with the tools
const agent = new Agent({
  name: 'Hackernews assistant',
  tools: tools,
});

// Run the agent with a query
const result = await run(agent, 'Tell me about the user `pg` in hackernews');
```

## Provider Configuration

The OpenAI Agents provider can be configured with various options:

```typescript
const provider = new OpenAIAgentsProvider({
  strict: true, // Enable strict mode for tool parameters
});
```

## Documentation

For more information about OpenAI Agents and how to use them, see:

- [OpenAI Strict Mode](https://openai.github.io/openai-agents-js/guides/tools/#options-reference)
- [OpenAI Agents SDK Documentation](https://openai.github.io/openai-agents-js/)
- [OpenAI Agents SDK GitHub](https://github.com/openai/openai-agents-js)
