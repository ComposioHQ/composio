# Building Agents using Mastra with Composio

Build AI agents using Mastra with Composio Tool Router.

## Installation

```bash
npm install @composio/core @composio/mastra @mastra/core
```

**Find Latest Versions:**
```bash
npm view @mastra/core version
npm view @composio/mastra version
```

## Integration Method

**Mastra is an agentic provider** - use Tool Router for user isolation.

### Native Tools with Tool Router

```typescript
import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';
import { Agent } from '@mastra/core/agent';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new MastraProvider(),
});

async function createAgent(userId: string) {
  // Create session
  const session = await composio.create(userId, {
    toolkits: ['github'],
    manageConnections: true
  });

  const tools = await session.tools();

  // Create agent
  const agent = new Agent({
    id: 'github-agent',
    name: 'GitHub Agent',
    instructions: 'You manage GitHub repositories',
    model: 'openai/gpt-4o',
    tools: {
      ...tools,  // Spread Composio tools
    },
  });

  return agent;
}

const agent = await createAgent('user_123');
const result = await agent.generate({
  prompt: 'Create a GitHub issue titled "Bug Report"',
});

console.log(result.text);
```

### Streaming with Tool Router

```typescript
async function streamAgent(userId: string, prompt: string) {
  const session = await composio.create(userId, {
    toolkits: ['github'],
    manageConnections: true
  });

  const tools = await session.tools();

  const agent = new Agent({
    id: 'agent',
    model: 'openai/gpt-4o',
    tools: { ...tools },
    maxSteps: 10,
  });

  // Stream response
  const stream = await agent.stream({
    prompt,
    onStepFinish: (step) => {
      console.log('Step completed:', step);
    },
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk);
  }
}
```

## Key Features

- **40+ Model Providers**: OpenAI, Anthropic, Google, Mistral, Groq, etc.
- **Autonomous Agents**: Solve open-ended tasks
- **Streaming Support**: Real-time responses
- **v1.0 Released**: January 2026 - production ready

## Key Resources

- **Mastra Docs**: https://mastra.ai/docs
- **Tool Router Guide**: `/building-agents`
- **Agents Guide**: https://mastra.ai/docs/agents/overview
- **GitHub**: https://github.com/mastra-ai/mastra

## Environment Variables

```bash
OPENAI_API_KEY=sk-...  # Or other model provider
COMPOSIO_API_KEY=...
```

## Next Steps

1. Use `/building-agents` for comprehensive guide
2. Check `ts/examples/mastra/` for complete examples
3. See [Mastra docs](https://mastra.ai/docs) for multi-provider routing
