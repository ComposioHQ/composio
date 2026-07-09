# @composio/cloudflare

The Cloudflare provider formats Composio tools for Cloudflare Workers AI function calling (`AiTextGenerationToolInput`).

## Installation

```bash
npm install @composio/core @composio/cloudflare @cloudflare/workers-types
```

Set `COMPOSIO_API_KEY` with your API key from [the dashboard](https://dashboard.composio.dev/settings). In a Worker, add it as a secret (`wrangler secret put COMPOSIO_API_KEY`) and bind Workers AI as `AI` in your `wrangler.toml`; no separate model API key is needed.

## Quickstart

Create a session for your user, pass its tools to `env.AI.run`, and execute any tool calls the model returns:

```typescript
import { Composio } from '@composio/core';
import { CloudflareProvider } from '@composio/cloudflare';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const composio = new Composio({
      apiKey: env.COMPOSIO_API_KEY,
      provider: new CloudflareProvider(),
    });

    // Create a session for your user
    const session = await composio.sessions.create('user_123');
    const tools = await session.tools();

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Summarize my emails from today' },
      ],
      // session.tools() returns a collection keyed by tool slug
      tools: Object.values(tools),
    });

    const results = [];
    for (const toolCall of response.tool_calls ?? []) {
      results.push(await composio.provider.executeToolCall('user_123', toolCall, {}));
    }

    return Response.json({ response, results });
  },
};
```

`executeToolCall` takes the `{ name, arguments }` tool calls that Workers AI emits, runs the matching Composio tool for that user, and returns the result as a JSON string.

## Links

- [Composio documentation](https://docs.composio.dev)
