# @composio/llamaindex

Agentic Provider for Llamaindex in Composio SDK.

## Features

- **Full Modifier Support**: Support for both schema and execution modifiers
- **Tool Execution**: Execute tools with proper parameter handling
- **Type Safety**: Full TypeScript support with proper type definitions

## Installation

```bash
npm install @composio/llamaindex
# or
yarn add @composio/llamaindex
# or
pnpm add @composio/llamaindex
```

## Quick Start

```typescript
import { Composio } from '@composio/core';
import { LlamaindexProvider } from '@composio/llamaindex';

// Initialize Composio with Llamaindex provider
const composio = new Composio({
  apiKey: 'your-composio-api-key',
  provider: new LlamaindexProvider(),
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
import { LlamaindexProvider } from '@composio/llamaindex';

// Initialize Composio
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new LlamaindexProvider(),
});

// Get tools
const tools = await composio.tools.get('user123', {
  toolkits: ['gmail'],
});

// Use tools with Llamaindex
// Add your usage example here
```

## API Reference

### LlamaindexProvider Class

The `LlamaindexProvider` class extends `BaseAgenticProvider` and provides llamaindex-specific functionality.

#### Methods

##### `wrapTool(tool: Tool, executeTool: ExecuteToolFn): LlamaindexTool`

Wraps a tool in the llamaindex format.

```typescript
const tool = provider.wrapTool(composioTool, executeTool);
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
