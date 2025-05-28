# @composio/anthropic

Agentic Provider for Anthropic in Composio SDK.

## Features

- **Full Modifier Support**: Support for both schema and execution modifiers
- **Tool Execution**: Execute tools with proper parameter handling
- **Type Safety**: Full TypeScript support with proper type definitions

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
  provider: new AnthropicProvider(),
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

// Use tools with Anthropic
// Add your usage example here
```

## API Reference

### AnthropicProvider Class

The `AnthropicProvider` class extends `BaseAgenticProvider` and provides anthropic-specific functionality.

#### Methods

##### `wrapTool(tool: Tool, executeTool: ExecuteToolFn): AnthropicTool`

Wraps a tool in the anthropic format.

```typescript
const tool = provider.wrapTool(composioTool, executeTool);
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
