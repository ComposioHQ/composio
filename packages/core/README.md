# @composio/core

The core package of Composio SDK, providing essential functionality for building and managing AI-powered tools and toolsets.

## Features

### 1. Core Functionality
- **Composio Client Integration**: Seamless integration with Composio API
- **Tool Management**: Create, manage, and execute tools
- **Toolkit Support**: Organize tools into toolsets
- **Authentication & Authorization**: Built-in auth configuration and management
- **Connected Accounts**: Manage multiple account connections

### 2. Toolsets
- **Default OpenAI Toolset**: Ships with built-in OpenAI integration
- **Extensible Base Toolset**: Create custom toolsets by extending `BaseComposioToolset`
- **Tool Wrapping**: Standardized tool wrapping and execution

### 3. Advanced Features
- **Telemetry**: Built-in telemetry for monitoring and debugging
- **Logging**: Configurable logging system with multiple levels
- **Environment Management**: Flexible configuration through environment variables
- **Version Management**: Automatic version checking and updates

## Installation

```bash
npm install @composio/core
# or
yarn add @composio/core
# or
pnpm add @composio/core
```

## Quick Start

```typescript
import { Composio } from '@composio/core';

// Initialize Composio with default OpenAI toolset
const composio = new Composio({
  apiKey: 'your-api-key',
  baseURL: 'https://api.composio.dev', // optional
});

// Get available tools
const tools = await composio.getTools();

// Execute a specific tool
const result = await composio.tools.execute('tool-slug', {
  // tool parameters
});
```

## Configuration

The Composio constructor accepts the following configuration options:

```typescript
interface ComposioConfig {
  apiKey?: string;              // Your Composio API key
  baseURL?: string;             // Custom API base URL (optional)
  allowTracking?: boolean;      // Enable/disable telemetry (default: true)
  allowTracing?: boolean;       // Enable/disable tracing (default: true)
  toolset?: TToolset;          // Custom toolset (default: OpenAIToolset)
  userId?: string;             // Custom user ID
  connectedAccountIds?: Record<string, string>; // Connected account mappings
  telemetryTransport?: BaseTelemetryTransport; // Custom telemetry transport
}
```

## Toolsets

### Default OpenAI Toolset

The core package ships with OpenAI toolset by default. For more information about the OpenAI toolset and its capabilities, check out the [OpenAI Toolset Documentation](./toolset/OpenAIToolset.md).

### Creating Custom Toolsets

You can create custom toolsets by extending the `BaseComposioToolset`:

```typescript
import { BaseComposioToolset, Tool } from '@composio/core';

interface CustomTool {
  name: string;
  // ... custom tool properties
}

class CustomToolset extends BaseComposioToolset<CustomTool[], CustomTool> {
  readonly FILE_NAME = 'custom/toolset.ts';
  
  _wrapTool = (tool: Tool): CustomTool => {
    // Implement tool wrapping logic
    return {
      name: tool.name,
      // ... map other properties
    };
  };

  async getTools() {
    const tools = await this.client?.tools.list();
    return tools?.items.map(tool => this._wrapTool(tool)) ?? [];
  }
}
```

## Environment Variables

- `COMPOSIO_API_KEY`: Your Composio API key
- `COMPOSIO_BASE_URL`: Custom API base URL
- `COMPOSIO_LOGGING_LEVEL`: Logging level (silent, error, warn, info, debug)
- `DEVELOPMENT`: Development mode flag
- `CI`: CI environment flag

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
