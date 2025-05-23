# @composio/openai

The OpenAI provider for Composio SDK, providing seamless integration with OpenAI's models and function calling capabilities.

## Features

- **OpenAI Integration**: Seamless integration with OpenAI's models
- **Streaming Support**: First-class support for streaming responses
- **Function Calling**: Support for OpenAI's function calling feature
- **Tool Execution**: Execute tools with proper parameter handling
- **Type Safety**: Full TypeScript support with proper type definitions
- **Model Support**: Support for all OpenAI models (GPT-4, GPT-3.5-turbo, etc.)

## Installation

```bash
npm install @composio/openai
# or
yarn add @composio/openai
# or
pnpm add @composio/openai
```

## Quick Start

```typescript
import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai';

// Initialize Composio with OpenAI provider
const composio = new Composio({
  apiKey: 'your-composio-api-key',
  provider: new OpenAIProvider(),
});

// Get available tools
const tools = await composio.tools.get('user123', {
  toolkits: ['gmail', 'googlecalendar'],
  limit: 10,
});

// Get a specific tool
const sendEmailTool = await composio.tools.get('user123', 'GMAIL_SEND_EMAIL');
```

## Usage Examples

### Basic Chat Completion with Streaming

```typescript
import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai';
import OpenAI from 'openai';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new OpenAIProvider(),
});

// Example API route
export async function POST(req: Request) {
  const { messages } = await req.json();
  const tools = await composio.tools.get('user123', {
    toolkits: ['gmail'],
  });

  const stream = await openai.chat.completions.create({
    model: 'gpt-4',
    messages,
    tools,
    stream: true,
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
    },
  });
}
```

### Tool Execution with Streaming

```typescript
import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai';
import OpenAI from 'openai';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new OpenAIProvider(),
});

// Example API route that handles tool execution
export async function POST(req: Request) {
  const { messages } = await req.json();
  const tools = await composio.tools.get('user123', {
    toolkits: ['gmail', 'googlecalendar'],
  });

  const stream = await openai.chat.completions.create({
    model: 'gpt-4',
    messages,
    tools,
    tool_choice: 'auto',
    stream: true,
  });

  const chunks = [];
  for await (const chunk of stream) {
    if (chunk.choices[0]?.delta?.tool_calls) {
      const toolCall = chunk.choices[0].delta.tool_calls[0];
      const result = await composio.provider.executeToolCall(toolCall);
      // Handle tool execution result
      chunks.push(result);
    } else {
      chunks.push(chunk.choices[0]?.delta?.content || '');
    }
  }

  return new Response(chunks.join(''), {
    headers: {
      'content-type': 'text/plain',
    },
  });
}
```

### JSON Mode Example

```typescript
import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai';
import OpenAI from 'openai';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new OpenAIProvider(),
});

// Example API route that returns JSON
export async function POST(req: Request) {
  const { messages } = await req.json();
  const tools = await composio.tools.get('user123', {
    toolkits: ['gmail'],
  });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages,
    tools,
    response_format: { type: 'json_object' },
  });

  return Response.json(JSON.parse(completion.choices[0].message.content || '{}'));
}
```

### Vision Example

```typescript
import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai';
import OpenAI from 'openai';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new OpenAIProvider(),
});

// Example API route that handles image analysis
export async function POST(req: Request) {
  const { messages, image } = await req.json();
  const tools = await composio.tools.get('user123', {
    toolkits: ['gmail'],
  });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4-vision-preview',
    messages: [
      ...messages,
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What do you see in this image?' },
          { type: 'image_url', image_url: image },
        ],
      },
    ],
    tools,
    max_tokens: 500,
  });

  return Response.json({
    content: completion.choices[0].message.content,
  });
}
```

## API Reference

### OpenAIProvider Class

The `OpenAIProvider` class extends `BaseComposioProvider` and provides OpenAI-specific functionality.

#### Methods

##### `executeToolCall(tool: ToolCall): Promise<string>`

Executes a tool call and returns the result.

```typescript
const result = await provider.executeToolCall(toolCall);
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
