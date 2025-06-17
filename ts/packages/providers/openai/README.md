# @composio/openai

The OpenAI provider for Composio SDK, providing seamless integration with OpenAI's models and function calling capabilities.

## Features

- **OpenAI Integration**: Seamless integration with OpenAI's models
- **Streaming Support**: First-class support for streaming responses
- **Function Calling**: Support for OpenAI's function calling feature
- **Tool Execution**: Execute tools with proper parameter handling
- **Type Safety**: Full TypeScript support with proper type definitions
- **Model Support**: Support for all OpenAI models (GPT-4, GPT-3.5-turbo, etc.)
- **Responses API Support**: First-class support for OpenAI's Responses API

## Installation

```bash
npm install @composio/openai
# or
yarn add @composio/openai
# or
pnpm add @composio/openai
```

## Environment Variables

Required environment variables:

- `COMPOSIO_API_KEY`: Your Composio API key
- `OPENAI_API_KEY`: Your OpenAI API key

Optional environment variables:

- `OPENAI_API_BASE`: Custom API base URL (for Azure OpenAI)
- `OPENAI_ORGANIZATION`: OpenAI organization ID

## Quick Start

```typescript
import { Composio } from '@composio/core';
import { OpenAIProvider, OpenAIResponsesProvider } from '@composio/openai';

// Initialize Composio with OpenAI provider
const composio = new Composio({
  apiKey: 'your-composio-api-key',
  provider: new OpenAIProvider(), // For Chat Completions API
  // OR
  provider: new OpenAIResponsesProvider(), // For Responses API
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

- [Basic OpenAI Integration](../../examples/openai/src/index.ts)
- [Chat Completions Example](../../examples/openai/src/chat-completions.ts)
- [Assistants Example](../../examples/openai/src/assistants.ts)
- [Tools Example](../../examples/openai/src/tools.ts)
- [Responses API Example](../../examples/openai/src/responses-api/index.ts)

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

### Using the Responses API

```typescript
import { Composio } from '@composio/core';
import { OpenAIResponsesProvider } from '@composio/openai';
import OpenAI from 'openai';

const openai = new OpenAI();
const composio = new Composio({
  provider: new OpenAIResponsesProvider(),
});

// Get tools from Composio
const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER');

// Generate initial response from OpenAI
const initialResponse = await openai.responses.create({
  model: 'gpt-4.1',
  input: 'Tell me about the user `pg` in hackernews',
  tools,
});

// Handle tool calls from response
const modelInputs = await composio.provider.handleResponse(
  'default',
  initialResponse,
  {},
  {
    beforeExecute: async (toolSlug, toolkitSlug, params) => {
      console.log(`🔄 Executing tool ${toolSlug} from toolkit ${toolkitSlug}...`);
      return params;
    },
    afterExecute: async (toolSlug, toolkitSlug, result) => {
      console.log(`✅ Tool ${toolSlug} executed`);
      return result;
    },
  }
);

// Submit tool outputs back to OpenAI
const finalResponse = await openai.responses.create({
  model: 'gpt-4.1',
  input: [...initialResponse.output, ...modelInputs],
  tools,
});

// Process the final response
const finalContent = finalResponse.output[0];
if (finalContent.type === 'message' && finalContent.content[0].type === 'output_text') {
  console.log(finalContent.content[0].text);
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

## Provider Configuration

The OpenAI providers can be configured with various options:

```typescript
// For Chat Completions API
const provider = new OpenAIProvider();

// For Responses API
const responsesProvider = new OpenAIResponsesProvider({
  // Whether to enforce strict parameter validation
  strict: true, // Default: false
});
```

## API Reference

### OpenAIProvider Class

The `OpenAIProvider` class extends `BaseComposioProvider` and provides OpenAI-specific functionality for the Chat Completions API.

#### Methods

##### `executeToolCall(tool: ToolCall): Promise<string>`

Executes a tool call and returns the result.

```typescript
const result = await provider.executeToolCall(toolCall);
```

### OpenAIResponsesProvider Class

The `OpenAIResponsesProvider` class extends `BaseNonAgenticProvider` and provides OpenAI-specific functionality for the Responses API.

#### Methods

##### `handleResponse(userId: string, response: OpenAI.Responses.Response, options?: ExecuteToolFnOptions, modifiers?: ExecuteToolModifiers): Promise<OpenAI.Responses.ResponseInputItem.FunctionCallOutput[]>`

Handles tool calls from an OpenAI response and returns the tool outputs.

```typescript
const outputs = await provider.handleResponse('user123', response);
```

##### `handleToolCalls(userId: string, toolCalls: OpenAI.Responses.ResponseOutputItem[], options?: ExecuteToolFnOptions, modifiers?: ExecuteToolModifiers): Promise<OpenAI.Responses.ResponseInputItem.FunctionCallOutput[]>`

Handles specific tool calls from an OpenAI response.

```typescript
const outputs = await provider.handleToolCalls('user123', toolCalls);
```

##### `executeToolCall(userId: string, tool: OpenAI.Responses.ResponseFunctionToolCall, options?: ExecuteToolFnOptions, modifiers?: ExecuteToolModifiers): Promise<string>`

Executes a single tool call and returns the result.

```typescript
const result = await provider.executeToolCall('user123', toolCall);
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
