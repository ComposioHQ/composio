# @composio/core

The core Composio SDK which allows users to interact with the Composio Platform.

## Core Features

- **Tools**: Manage and execute tools within the Composio ecosystem. Includes functionality to list, retrieve, and execute tools.
- **Toolkits**: Organize and manage collections of tools for specific use cases.
- **Triggers**: Create and manage event triggers that can execute tools based on specific conditions. Includes support for different trigger types and status management.
- **AuthConfigs**: Configure authentication providers and settings. Manage auth configs with features to create, update, enable/disable, and delete configurations.
- **ConnectedAccounts**: Manage third-party service connections. Includes functionality to create, list, refresh, and manage the status of connected accounts.
- **ActionExecution**: Track and manage the execution of actions within the platform.

## Installation

```bash
npm install @composio/core
# or
yarn add @composio/core
# or
pnpm add @composio/core
```

## Configuration

```typescript
interface ComposioConfig {
  apiKey?: string; // Your Composio API key
  baseURL?: string; // Custom API base URL (optional)
  allowTracking?: boolean; // Enable/disable telemetry (default: true)
  allowTracing?: boolean; // Enable/disable tracing (default: true)
  toolset?: TToolset; // Custom toolset (default: OpenAIToolset)
  telemetryTransport?: BaseTelemetryTransport; // Custom telemetry transport
}

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  toolset: new OpenAIToolset(), // Optional: defaults to OpenAIToolset
});
```

## Toolsets

Composio SDK supports two types of toolsets, each with different modifier capabilities:

### 1. Non-Agentic Toolsets

These toolsets only support schema modifiers for transforming tool schemas. They are suitable for simple integrations like OpenAI, Anthropic, etc.

```typescript
import { Composio } from '@composio/core';
import { OpenAIToolset } from '@composio/openai-toolset';
import type { Tool } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  toolset: new OpenAIToolset(),
});

// Get a tool with schema modifiers
const tool = await composio.getToolBySlug('user123', 'HACKERNEWS_SEARCH_POSTS', {
  modifyToolSchema: (toolSlug: string, tool: Tool) => ({
    ...tool,
    description: 'Search HackerNews posts with improved description',
    inputParameters: {
      ...tool.inputParameters,
      limit: {
        type: 'number',
        description: 'Maximum number of posts to return',
      },
    },
  }),
});
```

### 2. Agentic Toolsets

These toolsets support full modifier capabilities, making them suitable for complex integrations like Vercel, Langchain, etc. They support:

1. **Schema Modifiers**: Transform tool schemas using `modifyToolSchema`
2. **Execution Modifiers**: Transform tool execution behavior
   - `beforeToolExecute`: Transform input parameters before execution
   - `afterToolExecute`: Transform output after execution

Example:

```typescript
import { Composio } from '@composio/core';
import { VercelToolset } from '@composio/vercel-toolset';
import type { Tool, ToolExecuteParams, ToolExecuteResponse } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  toolset: new VercelToolset(),
});

// Get a tool with full modifier support
const tool = await composio.getToolBySlug('user123', 'HACKERNEWS_SEARCH_POSTS', {
  // Schema modifier
  modifyToolSchema: (toolSlug: string, tool: Tool) => ({
    ...tool,
    description: 'Search HackerNews posts with improved description',
    inputParameters: {
      ...tool.inputParameters,
      limit: {
        type: 'number',
        description: 'Maximum number of posts to return',
      },
    },
  }),
  // Execution modifiers
  beforeToolExecute: (toolSlug: string, params: ToolExecuteParams) => ({
    ...params,
    arguments: {
      ...params.arguments,
      limit: Math.min((params.arguments?.limit as number) || 10, 100),
    },
  }),
  afterToolExecute: (toolSlug: string, response: ToolExecuteResponse) => ({
    ...response,
    data: {
      ...response.data,
      posts: (response.data?.posts as any[]).map(post => ({
        ...post,
        url: post.url || `https://news.ycombinator.com/item?id=${post.id}`,
      })),
    },
  }),
});
```

## Creating a Custom Toolset

To create a new toolset, extend either `BaseNonAgenticToolset` or `BaseAgenticToolset` from `@composio/core`:

```typescript
import { BaseNonAgenticToolset } from '@composio/core';
import type { Tool, ToolListParams, ToolOptions } from '@composio/core';

interface CustomTool {
  name: string;
  // ... custom tool properties
}

export class CustomToolset extends BaseNonAgenticToolset<Array<CustomTool>, CustomTool> {
  readonly FILE_NAME: string = 'custom/toolset.ts';

  wrapTool = (tool: Tool): CustomTool => {
    return {
      name: tool.name,
      // ... map other properties
    };
  };

  async getTools(
    userId: string,
    params?: ToolListParams,
    options?: ToolOptions
  ): Promise<Array<CustomTool>> {
    const tools = await this.getComposio().tools.getComposioTools(
      userId,
      params,
      options?.modifyToolSchema
    );
    return tools?.map(tool => this.wrapTool(tool)) ?? [];
  }

  async getToolBySlug(userId: string, slug: string, options?: ToolOptions): Promise<CustomTool> {
    const tool = await this.getComposio().tools.getComposioToolBySlug(
      userId,
      slug,
      options?.modifyToolSchema
    );
    return this.wrapTool(tool);
  }
}
```

To quickly create a toolset project, use the provided script:

```bash
# Create a non-agentic toolset (default)
pnpm run create-toolset <your-toolset-name>

# Create an agentic toolset
pnpm run create-toolset <your-toolset-name> --agentic
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
