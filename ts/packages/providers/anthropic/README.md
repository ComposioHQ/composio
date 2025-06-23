# @composio/anthropic

Non-Agentic Provider for Anthropic in Composio SDK.

## Features

- **Tool Integration**: Seamless integration with Anthropic's tool calling capabilities
- **Type Safety**: Full TypeScript support with proper type definitions
- **Tool Execution**: Execute tools with proper parameter handling and response formatting
- **Caching Support**: Optional tool caching for improved performance
- **Modifier Support**: Support for execution modifiers to transform tool inputs and outputs
- **Streaming Support**: First-class support for streaming responses

## Installation

```bash
npm install @composio/anthropic
# or
yarn add @composio/anthropic
# or
pnpm add @composio/anthropic
```

## Environment Variables

Required environment variables:

- `COMPOSIO_API_KEY`: Your Composio API key
- `ANTHROPIC_API_KEY`: Your Anthropic API key

Optional environment variables:

- `ANTHROPIC_API_URL`: Custom API base URL (defaults to Anthropic's API)

## Quick Start

```typescript
import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';

// Initialize Composio with Anthropic provider
const composio = new Composio({
  apiKey: 'your-composio-api-key',
  // Initialize with optional caching
  provider: new AnthropicProvider({ cacheTools: true }),
});

// Get available tools
const tools = await composio.tools.get('user123', {
  toolkits: ['gmail', 'googlecalendar'],
  limit: 10,
});
```

## Examples

Check out our complete example implementations:

- [Basic Anthropic Integration](../../examples/anthropic/src/index.ts)
- [Streaming Example](../../examples/anthropic/src/streaming.ts)

### Basic Example

```typescript
import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';
import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Initialize Composio
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new AnthropicProvider(),
});

// Get tools
const tools = await composio.tools.get('user123', {
  toolkits: ['gmail'],
});

// Create a message with tools
const message = await anthropic.messages.create({
  model: 'claude-3-sonnet-20240229',
  max_tokens: 1024,
  tools: tools,
  messages: [
    {
      role: 'user',
      content: 'Send an email to support@example.com',
    },
  ],
});

// Handle tool calls
if (message.content[0].type === 'tool_calls') {
  const toolCall = message.content[0];
  const result = await composio.provider.executeToolCall('user123', toolCall, {
    connectedAccountId: 'account123',
  });
  console.log('Tool execution result:', result);
}
```

### Streaming Example

```typescript
import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new AnthropicProvider(),
});

const tools = await composio.tools.get('user123', {
  toolkits: ['gmail'],
});

const stream = await anthropic.messages.stream({
  model: 'claude-3-sonnet-20240229',
  max_tokens: 1024,
  tools: tools,
  messages: [
    {
      role: 'user',
      content: 'Send an email to support@example.com',
    },
  ],
});

for await (const messageChunk of stream) {
  if (messageChunk.type === 'content_block_delta' && messageChunk.delta.type === 'tool_calls') {
    const result = await composio.provider.executeToolCall('user123', messageChunk.delta, {
      connectedAccountId: 'account123',
    });
    console.log('Tool execution result:', result);
  } else {
    console.log('Message chunk:', messageChunk);
  }
}
```

## Provider Configuration

The Anthropic provider can be configured with various options:

```typescript
const provider = new AnthropicProvider({
  // Enable tool caching
  cacheTools: true,
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

### AnthropicProvider Class

The `AnthropicProvider` class extends `BaseNonAgenticProvider` and provides Anthropic-specific functionality.

#### Constructor

```typescript
new AnthropicProvider(options?: { cacheTools?: boolean })
```

- `options.cacheTools`: Optional boolean to enable tool caching (default: false)

#### Methods

##### `wrapTool(tool: Tool): AnthropicTool`

Wraps a Composio tool in the Anthropic format.

```typescript
const tool = provider.wrapTool(composioTool);
```

##### `wrapTools(tools: Tool[]): AnthropicToolCollection`

Wraps multiple Composio tools in the Anthropic format.

```typescript
const tools = provider.wrapTools(composioTools);
```

##### `executeToolCall(userId: string, toolUse: AnthropicToolUseBlock, options?: ExecuteToolFnOptions, modifiers?: ExecuteToolModifiers): Promise<string>`

Executes a tool call from Anthropic and returns the result as a string.

```typescript
const result = await composio.provider.executeToolCall(
  'user123',
  {
    type: 'tool_use',
    id: 'tu_123',
    name: 'tool-name',
    input: { param: 'value' },
  },
  {
    connectedAccountId: 'account123',
    customAuthParams: {
      /* ... */
    },
  },
  {
    beforeExecute: params => params,
    afterExecute: response => response,
  }
);
```

##### `handleToolCalls(userId: string, message: Message, options?: ExecuteToolFnOptions, modifiers?: ExecuteToolModifiers): Promise<Anthropic.Messages.MessageParam[]>`

Processes and executes all tool calls found in an Anthropic message response. This method automatically extracts tool calls from the message content, executes them, and returns their results.

**Parameters:**

- `userId` (string): The ID of the user making the tool calls
- `message` (Message): The Anthropic message response containing tool calls
- `options` (optional): Additional options for tool execution
  - `connectedAccountId`: ID of the connected account
  - `customAuthParams`: Custom authentication parameters
- `modifiers` (optional): Functions to modify tool execution
  - `beforeExecute`: Transform parameters before execution
  - `afterExecute`: Transform response after execution

**Returns:**
Promise<Anthropic.Messages.MessageParam[]>: Tool execution results for the assistant message

**Example:**

```typescript
const message = {
  id: 'msg_123',
  content: [
    { type: 'text', text: 'Hello' },
    {
      type: 'tool_use',
      id: 'tu_123',
      name: 'test-tool',
      input: { param: 'value' },
    },
    {
      type: 'tool_use',
      id: 'tu_456',
      name: 'another-tool',
      input: { param: 'value2' },
    },
  ],
};

const results = await provider.handleToolCalls(
  'user123',
  message,
  {
    connectedAccountId: 'account123',
    customAuthParams: {
      parameters: [{ name: 'token', value: 'abc123', in: 'header' }],
    },
  },
  {
    beforeExecute: params => params,
    afterExecute: response => response,
  }
);

// results will be an array of tool execution responses
// from each tool execution in the order they appeared
// this can be passed directly to LLM
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
