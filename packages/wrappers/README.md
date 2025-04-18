# Composio Wrappers

> **Note:** This is a work in progress. The wrapper system is under active development and may change in future releases.

## Overview

Composio Wrappers provide runtime-specific implementations of Composio Core functionality. These wrappers adapt the core functionality to work in different environments such as:

- Browser environments
- Edge runtimes
- Serverless environments
- Node.js environments
- Mobile environments

## Available Interfaces

### Core Components

- **@composio/core**: The main package containing core functionality and interfaces
- **BaseComposioToolset**: Abstract base class for creating custom toolsets

### Telemetry

Composio provides built-in telemetry capabilities that can be used in your wrappers:

- **Telemetry**: Core telemetry implementation
- **BaseTelemetryTransport**: Base class for creating custom telemetry transports

### Models

The following models are available for extension:

- **Tools**: Manage and interact with tools
- **Toolkits**: Handle collections of tools
- **Triggers**: Manage event triggers and subscriptions
- **AuthConfigs**: Handle authentication configurations
- **ConnectedAccounts**: Manage connected accounts
- **Session**: Handle session management

## Creating a Runtime Wrapper

To create a runtime-specific wrapper, you need to implement the core functionality while adapting it to your target environment:

```typescript
import { Composio } from '@composio/core';

class BrowserRuntimeWrapper {
  private composio: Composio;

  constructor(config: ComposioConfig) {
    // Initialize with browser-specific configurations
    this.composio = new Composio({
      ...config,
      // Add browser-specific configurations
      allowTracking: true,
      telemetryTransport: new BrowserTelemetryTransport()
    });
  }

  // Implement browser-specific methods
  async initialize() {
    // Browser-specific initialization
  }

  // Override or extend core methods as needed
  async getTools() {
    // Browser-specific implementation
    return this.composio.getTools();
  }
}
```

## Configuration

Wrappers can be configured using the `ComposioConfig` interface with runtime-specific options:

```typescript
const config = {
  apiKey: 'your-api-key',
  baseURL: 'https://api.composio.dev',
  allowTracking: true,
  allowTracing: true,
  // Runtime-specific configurations
  runtime: 'browser',
  userId: 'user-id',
  connectedAccountIds: {},
  telemetryTransport: new RuntimeSpecificTelemetryTransport()
};
```

## Best Practices

1. **Environment Detection**: Implement proper environment detection for your target runtime
2. **Telemetry Integration**: Implement telemetry that works in your target environment
3. **Error Handling**: Implement runtime-specific error handling
4. **Type Safety**: Use TypeScript for better type safety and developer experience
5. **Documentation**: Document your wrapper's functionality and usage
6. **Polyfills**: Include necessary polyfills for your target environment
7. **Size Optimization**: Optimize bundle size for your target environment

## Example: Browser Wrapper

Here's a simple example of creating a browser-specific wrapper:

```typescript
import { Composio } from '@composio/core';

class BrowserWrapper {
  private composio: Composio;

  constructor(config: ComposioConfig) {
    // Initialize with browser-specific configurations
    this.composio = new Composio({
      ...config,
      runtime: 'browser',
      telemetryTransport: new BrowserTelemetryTransport()
    });
  }

  async initialize() {
    // Check if running in browser
    if (typeof window === 'undefined') {
      throw new Error('This wrapper is only for browser environments');
    }

    // Initialize browser-specific features
    await this.initializeBrowserFeatures();
  }

  private async initializeBrowserFeatures() {
    // Initialize browser-specific features
    // e.g., service workers, indexedDB, etc.
  }

  // Browser-specific implementation of core methods
  async getTools() {
    // Add browser-specific caching or other optimizations
    return this.composio.getTools();
  }
}
```

## Contributing

We welcome contributions to the wrapper system. Please follow these guidelines:

1. Create a new package in the `packages/wrappers` directory
2. Follow the existing code structure and patterns
3. Include proper documentation and tests
4. Submit a pull request with a clear description of your changes

## License

This project is licensed under the ISC License.
