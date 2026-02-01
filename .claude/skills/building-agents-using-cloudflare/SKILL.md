# Building Agents using Cloudflare with Composio

Build edge-deployed AI agents using Cloudflare Workers AI with Composio Tool Router.

## Installation

```bash
npm install @composio/core @composio/cloudflare agents @cloudflare/ai-utils
npm install wrangler -D  # For development
```

**Find Latest Versions:**
```bash
npm view agents version
npm view @composio/cloudflare version
```

## Integration Method

**Cloudflare is an agentic provider** - use Tool Router for user isolation.

### Native Tools with Tool Router

```typescript
import { Agent } from 'agents';
import { Composio } from '@composio/core';
import { CloudflareProvider } from '@composio/cloudflare';

export class MyAgent extends Agent {
  private composio: Composio;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);

    this.composio = new Composio({
      apiKey: env.COMPOSIO_API_KEY,
      provider: new CloudflareProvider(),
    });
  }

  async onStart() {
    // Initialize with user-specific session
    const session = await this.composio.create(this.userId, {
      toolkits: ['github'],
      manageConnections: true
    });

    this.tools = await session.tools();
  }

  async handleMessage(message: string) {
    // Use tools with Cloudflare AI
    const response = await this.ai.run('@cf/meta/llama-3.1-70b-instruct', {
      messages: [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: message },
      ],
      tools: this.tools,
    });

    return response;
  }
}
```

### wrangler.toml Configuration

```toml
name = "my-agent"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[durable_objects.bindings]]
name = "MY_AGENT"
class_name = "MyAgent"

[ai]
binding = "AI"

[vars]
COMPOSIO_API_KEY = "your-key-here"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["MyAgent"]
```

## Key Features

- **Edge Deployment**: Low-latency worldwide
- **Durable Objects**: Persistent agent state
- **Workers AI**: Run models at the edge
- **Embedded Function Calling**: AI executes functions automatically

## Key Resources

- **Cloudflare Agents SDK**: https://developers.cloudflare.com/agents/
- **Tool Router Guide**: `/building-agents`
- **Workers AI**: https://developers.cloudflare.com/workers-ai/
- **Function Calling**: https://developers.cloudflare.com/workers-ai/features/function-calling/

## Environment Variables

```bash
COMPOSIO_API_KEY=...
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
```

## Deployment

```bash
# Deploy with Wrangler
npx wrangler deploy

# Tail logs
npx wrangler tail
```

## Next Steps

1. Use `/building-agents` for comprehensive guide
2. Check `ts/examples/cloudflare-wrangler/` for complete examples
3. See [Cloudflare docs](https://developers.cloudflare.com/agents/) for edge features
