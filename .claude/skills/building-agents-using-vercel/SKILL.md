# Building Agents using Vercel AI SDK with Composio

Build AI agents using Vercel AI SDK with Composio Tool Router for user-isolated tool sessions.

## Installation

```bash
npm install @composio/core @composio/vercel ai @ai-sdk/openai
```

**Find Latest Versions:**
```bash
npm view ai version
npm view @composio/vercel version
```

## Integration Method

**Vercel AI SDK is an agentic provider** - use Tool Router for user isolation.

### Native Tools (Recommended)

```typescript
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

async function runAgent(userId: string, prompt: string) {
  // Create user session
  const session = await composio.create(userId, {
    toolkits: ['github'],
    manageConnections: true
  });

  // Get native Vercel-formatted tools
  const tools = await session.tools();

  // Use with Vercel AI SDK
  const result = await generateText({
    model: openai('gpt-4o'),
    prompt,
    tools,
    maxSteps: 10,
  });

  return result.text;
}

await runAgent('user_123', 'Create a GitHub issue');
```

### MCP Integration (Optional)

```typescript
import { Composio } from '@composio/core';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { streamText } from 'ai';

const composio = new Composio();

async function runAgentMCP(userId: string, prompt: string) {
  // Create session
  const session = await composio.create(userId, {
    toolkits: ['github'],
    manageConnections: true
  });

  // Connect via MCP
  const client = await createMCPClient({
    transport: {
      type: 'http',
      url: session.mcp.url,
      headers: session.mcp.headers
    }
  });

  const tools = await client.tools();

  // Use with any framework
  const stream = await streamText({
    model: openai('gpt-4o'),
    prompt,
    tools,
  });

  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
  }
}
```

## Key Resources

- **Vercel AI SDK Docs**: https://ai-sdk.dev/docs/introduction
- **Tool Router Guide**: `/building-agents`
- **Building Agents Guide**: https://vercel.com/kb/guide/how-to-build-ai-agents-with-vercel-and-the-ai-sdk
- **Native vs MCP**: Use native tools for better performance, MCP for framework flexibility

## Environment Variables

```bash
COMPOSIO_API_KEY=...
OPENAI_API_KEY=...  # Or other model provider
```

## Next Steps

1. Use `/building-agents` for comprehensive Tool Router documentation
2. Check `ts/examples/vercel/` for complete examples
3. See [Vercel AI SDK docs](https://ai-sdk.dev) for framework-specific features
