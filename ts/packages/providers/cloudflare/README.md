# @composio/cloudflare

The Cloudflare AI provider for Composio SDK, providing seamless integration with Cloudflare's AI capabilities and Workers AI.

## Features

- **Workers AI Integration**: Seamless integration with Cloudflare Workers AI
- **Streaming Support**: First-class support for streaming responses
- **Model Support**: Support for all Cloudflare AI models (@cf/meta/llama-2-7b-chat-int8, etc.)
- **Edge Deployment**: Deploy and run AI models at the edge
- **Tool Execution**: Execute tools with proper parameter handling
- **Type Safety**: Full TypeScript support with proper type definitions

## Installation

```bash
npm install @composio/cloudflare
# or
yarn add @composio/cloudflare
# or
pnpm add @composio/cloudflare
```

## Quick Start

```typescript
import { Composio } from '@composio/core';
import { CloudflareProvider } from '@composio/cloudflare';

// Initialize Composio with Cloudflare provider
const composio = new Composio({
  apiKey: 'your-composio-api-key',
  provider: new CloudflareProvider({
    accountId: 'your-cloudflare-account-id',
    apiToken: 'your-cloudflare-api-token',
  }),
});

// Get available tools
const tools = await composio.tools.get('user123', {
  toolkits: ['gmail', 'googlecalendar'],
  limit: 10,
});
```

## Usage Examples

### Basic Chat Completion with Streaming

```typescript
import { Composio } from '@composio/core';
import { CloudflareProvider } from '@composio/cloudflare';
import { Ai } from '@cloudflare/ai';

// Initialize Composio
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new CloudflareProvider(),
});

// In your Worker
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const ai = new Ai(env.AI);
    const tools = await composio.tools.get('user123', {
      toolkits: ['gmail'],
    });

    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What can you do?' },
    ];

    const stream = await ai.run('@cf/meta/llama-2-7b-chat-int8', {
      messages,
      tools,
      stream: true,
    });

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
      },
    });
  },
};
```

### Multi-Modal Example

```typescript
import { Composio } from '@composio/core';
import { CloudflareProvider } from '@composio/cloudflare';
import { Ai } from '@cloudflare/ai';

// Initialize Composio
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new CloudflareProvider(),
});

// In your Worker
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const ai = new Ai(env.AI);
    const tools = await composio.tools.get('user123', {
      toolkits: ['gmail'],
    });

    // Image analysis
    const imageResponse = await ai.run('@cf/microsoft/resnet-50', {
      image: await request.arrayBuffer(),
    });

    // Use image analysis in chat
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      {
        role: 'user',
        content: 'What do you see in this image?',
        context: { image_analysis: imageResponse },
      },
    ];

    const stream = await ai.run('@cf/meta/llama-2-7b-chat-int8', {
      messages,
      tools,
      stream: true,
    });

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
      },
    });
  },
};
```

## API Reference

### CloudflareProvider Class

The `CloudflareProvider` class extends `BaseComposioProvider` and provides Cloudflare-specific functionality.

#### Methods

##### `executeToolCall(tool: ToolCall): Promise<string>`

Executes a tool call and returns the result.

```typescript
const result = await composio.provider.executeToolCall(toolCall);
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
