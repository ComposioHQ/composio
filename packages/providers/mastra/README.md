# @composio/mastra

Agentic Provider for Mastra in Composio SDK.

## Features

- **Full Modifier Support**: Support for both schema and execution modifiers
- **Tool Execution**: Execute tools with proper parameter handling
- **Type Safety**: Full TypeScript support with proper type definitions

## Installation

```bash
npm install @composio/mastra
# or
yarn add @composio/mastra
# or
pnpm add @composio/mastra
```

## Quick Start

```typescript
import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';

// Initialize Composio with Mastra provider
const composio = new Composio({
  apiKey: 'your-composio-api-key',
  provider: new MastraProvider(),
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
import { MastraProvider } from '@composio/mastra';

// Initialize Composio
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new MastraProvider(),
});

// Get tools
const tools = await composio.tools.get('user123', {
  toolkits: ['gmail'],
});

// Use tools with Mastra
// Add your usage example here
```

## API Reference

### MastraProvider Class

The `MastraProvider` class extends `BaseAgenticProvider` and provides mastra-specific functionality.

#### Methods

##### `wrapTool(tool: Tool, executeTool: ExecuteToolFn): MastraTool`

Wraps a tool in the mastra format.

```typescript
const tool = provider.wrapTool(composioTool, executeTool);
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
