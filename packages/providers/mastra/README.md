# @composio/mastra

Agentic Provider for Mastra in Composio SDK.

## Features

- **Full Modifier Support**: Support for both schema and execution modifiers
- **Tool Execution**: Execute tools with proper parameter handling
- **Type Safety**: Full TypeScript support with proper type definitions
- **Agentic Capabilities**: Full support for autonomous agent behavior
- **Streaming Support**: First-class support for streaming responses
- **Custom Execution**: Support for custom tool execution strategies

## Installation

```bash
npm install @composio/core @composio/mastra
# or
yarn add @composio/core @composio/mastra
# or
pnpm add @composio/core @composio/mastra
```

## Environment Variables

Required environment variables:

- `COMPOSIO_API_KEY`: Your Composio API key
- `MASTRA_API_KEY`: Your Mastra API key

Optional environment variables:

- `MASTRA_API_URL`: Custom API base URL (defaults to Mastra's API)
- `MASTRA_DEBUG`: Enable debug logging (set to "true")

## Quick Start

```typescript
import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';

// Initialize Composio with Mastra provider
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new MastraProvider({
    apiKey: process.env.MASTRA_API_KEY,
  }),
});

// Get available tools
const tools = await composio.tools.get('user123', {
  toolkits: ['gmail', 'googlecalendar'],
  limit: 10,
});
```

## Examples

Check out our complete example implementations:

- [Basic Mastra Integration](../../examples/mastra/src/index.ts)

## API Reference

### MastraProvider Class

The `MastraProvider` class extends `BaseAgenticProvider` and provides Mastra-specific functionality.

#### Constructor

```typescript
new MastraProvider(options?: MastraProviderOptions)
```

Options:

- `apiKey`: Your Mastra API key
- `apiUrl`: Custom API base URL
- `debug`: Enable debug logging
- `modifiers`: Custom execution modifiers
- `executionStrategy`: Custom tool execution strategy

#### Methods

##### `wrapTool(tool: Tool, executeTool: ExecuteToolFn): MastraTool`

Wraps a tool in the Mastra format.

```typescript
const tool = provider.wrapTool(composioTool, executeTool);
```

##### `wrapTools(tools: Tool[], executeTool: ExecuteToolFn): MastraToolCollection`

Wraps multiple tools in the Mastra format.

```typescript
const tools = provider.wrapTools(composioTools, executeTool);
```

##### `executeToolCall(userId: string, toolCall: MastraToolCall, options?: ExecuteToolFnOptions): Promise<string>`

Executes a tool call from Mastra and returns the result.

```typescript
const result = await provider.executeToolCall('user123', toolCall, {
  connectedAccountId: 'account123',
});
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
