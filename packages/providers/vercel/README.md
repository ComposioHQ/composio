# @composio/vercel

The Vercel AI SDK provider for Composio SDK, providing seamless integration with Vercel's AI SDK and tools.

## Features

- **Vercel AI SDK Integration**: Seamless integration with Vercel's AI SDK
- **Streaming Support**: First-class support for streaming responses
- **Model Agnostic**: Works with any model supported by Vercel AI SDK (OpenAI, Anthropic, etc.)
- **UI Components**: Integration with Vercel's React components for chat interfaces
- **Tool Execution**: Execute tools with proper parameter handling and streaming
- **Type Safety**: Full TypeScript support with proper type definitions

## Installation

```bash
npm install @composio/vercel ai
# or
yarn add @composio/vercel ai
# or
pnpm add @composio/vercel ai
```

## Environment Variables

Required environment variables:

- `COMPOSIO_API_KEY`: Your Composio API key

Optional environment variables (based on model choice):

- `OPENAI_API_KEY`: Your OpenAI API key (if using OpenAI)
- `ANTHROPIC_API_KEY`: Your Anthropic API key (if using Anthropic)
- `GEMINI_API_KEY`: Your Google AI API key (if using Gemini)

## Quick Start

```typescript
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';

// Initialize Composio with Vercel provider
const composio = new Composio({
  apiKey: 'your-composio-api-key',
  provider: new VercelProvider(),
});

// Get available tools
const tools = await composio.tools.get('user123', {
  toolkits: ['gmail', 'googlecalendar'],
  limit: 10,
});

// Get a specific tool
const sendEmailTool = await composio.tools.get('user123', 'GMAIL_SEND_EMAIL');
```

## Examples

Check out our complete example implementations:

- [Basic Vercel Integration](../../examples/vercel/src/index.ts)

### Basic Chat Completion with Streaming

```typescript
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { useChat } from 'ai/react';

// Initialize Composio with Vercel provider
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider()
});

// In your React component
function ChatComponent() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat',
  });

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          {m.role === 'user' ? 'User: ' : 'AI: '}
          {m.content}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Say something..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

// In your API route (e.g. app/api/chat/route.ts)
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const tools = await composio.tools.get('user123', {
    toolkits: ['gmail'],
  });

  const result = streamText({
    model: openai('gpt-4'),
    messages,
    tools,
  });

  return result.toDataStreamResponse();
}
```

### Tool Execution with Streaming

```typescript
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { streamText } from 'ai';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

// Example API route that handles tool execution
export async function POST(req: Request) {
  const { messages } = await req.json();
  const tools = await composio.tools.get('user123', {
    toolkits: ['gmail', 'googlecalendar'],
  });

  const stream = streamText({
    model: openai('gpt-4'),
    messages,
    tools,
    callbacks: {
      onToolCall: async tool => {
        // Execute the tool and return result
        return await composio.provider.executeToolCall(tool);
      },
    },
  });

  return stream.toDataStreamResponse();
}
```

## Provider Configuration

The Vercel provider can be configured with various options:

```typescript
const provider = new VercelProvider({
  // Default model configuration
  model: openai('gpt-4'),
  // Custom execution modifiers
  modifiers: {
    beforeExecute: params => {
      // Transform parameters before execution
      return params;
    },
    afterExecute: response => {
      // Transform response after execution
      return response;
    },
  },
});
```

## API Reference

### VercelProvider Class

The `VercelProvider` class extends `BaseComposioProvider` and provides Vercel AI SDK-specific functionality.

#### Methods

##### `executeToolCall(tool: ToolCall): Promise<string>`

Executes a tool call and returns the result.

```typescript
const result = await provider.executeToolCall(toolCall);
```

##### `handleToolCalls(stream: AIStream): AsyncGenerator<AIStreamEvent>`

Handles tool calls from a stream and yields events.

```typescript
for await (const event of provider.handleToolCalls(stream)) {
  // Handle events
}
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
