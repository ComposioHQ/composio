# @composio/anthropic

Non-Agentic Provider for Anthropic in Composio SDK.

## Features

- **Tool Integration**: Seamless integration with Anthropic's tool calling capabilities
- **Type Safety**: Full TypeScript support with proper type definitions
- **Tool Execution**: Execute tools with proper parameter handling and response formatting
- **Caching Support**: Optional tool caching for improved performance
- **Modifier Support**: Support for execution modifiers to transform tool inputs and outputs

## Installation

```bash
npm install @composio/anthropic
# or
yarn add @composio/anthropic
# or
pnpm add @composio/anthropic
```

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

## Usage Examples

### Basic Example

```typescript
import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';

// Initialize Composio
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new AnthropicProvider(),
});

// Get tools
const tools = await composio.tools.get('user123', {
  toolkits: ['gmail'],
});

// Handle tool execution with modifiers
const modifiers = {
  beforeExecute: params => {
    // Transform tool parameters before execution
    return params;
  },
  afterExecute: response => {
    // Transform tool response after execution
    return response;
  },
};

// Execute a tool with options
const result = await provider.executeTool(
  'tool-name',
  {
    userId: 'user123',
    arguments: { input: 'value' },
    connectedAccountId: 'account123',
    customAuthParams: {
      parameters: [{ name: 'token', value: 'abc123', in: 'header' }],
    },
  },
  modifiers
);
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
const result = await provider.executeToolCall(
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

##### `handleToolCalls(userId: string, message: Message, options?: ExecuteToolFnOptions, modifiers?: ExecuteToolModifiers): Promise<string[]>`

Handles tool calls from an Anthropic message response.

```typescript
const results = await provider.handleToolCalls('user123', message, options, modifiers);
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
