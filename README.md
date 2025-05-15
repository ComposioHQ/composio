# @composio/core

The core Composio SDK which allows users to interact with the Composio Platform. It provides a powerful and flexible way to manage and execute tools, handle authentication, and integrate with various platforms and frameworks.

## Core Features

- **Tools**: Manage and execute tools within the Composio ecosystem. Includes functionality to list, retrieve, and execute tools.
- **Toolkits**: Organize and manage collections of tools for specific use cases.
- **Triggers**: Create and manage event triggers that can execute tools based on specific conditions.
- **AuthConfigs**: Configure authentication providers and settings.
- **ConnectedAccounts**: Manage third-party service connections.
- **ActionExecution**: Track and manage the execution of actions within the platform.

## Installation

### Core SDK

```bash
npm install @composio/core
# or
yarn add @composio/core
# or
pnpm add @composio/core
```

### Toolsets

```bash
# Install OpenAI toolset (included in core)
npm install @composio/openai

# Install Vercel AI toolset
npm install @composio/vercel

# Install Langchain toolset
npm install @composio/langchain
```

## Getting Started

### Basic Usage with OpenAI Toolset

```typescript
import { Composio } from '@composio/core';
import { OpenAIToolset } from '@composio/openai-toolset';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  // OpenAIToolset is the default, so this is optional
  toolset: new OpenAIToolset(),
});

// Fetch a single tool
const searchTool = await composio.tools.get('user123', 'HACKERNEWS_SEARCH_POSTS');

// Fetch multiple tools
const tools = await composio.tools.get('user123', {
  category: 'search',
  limit: 10,
});
```

## Using with a Toolset

### Example with Vercel AI Toolset

```typescript
import { Composio } from '@composio/core';
import { VercelToolset } from '@composio/vercel-toolset';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  toolset: new VercelToolset(),
});

// Fetch tools for Vercel AI SDK
const tools = await composio.tools.get('user123', {
  category: 'search',
});

// Use tools with Vercel AI SDK
const completion = await ai.chat({
  messages: [{ role: 'user', content: 'Search for posts about React' }],
  tools: tools,
});
```

## Modifiers

Composio SDK supports powerful modifiers to transform tool schemas and execution behavior.

### Schema Modifiers

Schema modifiers allow you to transform tool schemas before they are used:

```typescript
const tool = await composio.tools.get('user123', 'HACKERNEWS_SEARCH_POSTS', {
  modifyToolSchema: (toolSlug: string, tool: Tool) => ({
    ...tool,
    description: 'Enhanced HackerNews search with additional features',
    inputParameters: {
      ...tool.inputParameters,
      limit: {
        type: 'number',
        description: 'Maximum number of posts to return',
        default: 10,
      },
    },
  }),
});
```

### Execution Modifiers

For agentic toolsets (like Vercel AI and Langchain), you can also modify tool execution behavior:

```typescript
const tool = await composio.tools.get('user123', 'HACKERNEWS_SEARCH_POSTS', {
  // Transform input before execution
  beforeToolExecute: (toolSlug: string, params: ToolExecuteParams) => ({
    ...params,
    arguments: {
      ...params.arguments,
      limit: Math.min((params.arguments?.limit as number) || 10, 100),
    },
  }),

  // Transform output after execution
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

## Development

### Creating Custom Toolsets

You can create custom toolsets by extending either `BaseNonAgenticToolset` or `BaseAgenticToolset`:

#### Non-Agentic Toolset

```typescript
import { BaseNonAgenticToolset } from '@composio/core';
import type { Tool } from '@composio/core';

interface CustomTool {
  name: string;
  // ... custom tool properties
}

export class CustomToolset extends BaseNonAgenticToolset<CustomTool[], CustomTool> {
  readonly name = 'custom-toolset';

  wrapTool = (tool: Tool): CustomTool => ({
    name: tool.name,
    // ... map other properties
  });

  wrapTools = (tools: Tool[]): CustomTool[] => tools.map(tool => this.wrapTool(tool));
}
```

#### Agentic Toolset

```typescript
import { BaseAgenticToolset } from '@composio/core';
import type { Tool, ToolExecuteParams, ToolExecuteResponse } from '@composio/core';

export class CustomAgenticToolset extends BaseAgenticToolset<CustomTool[], CustomTool> {
  readonly name = 'custom-agentic-toolset';

  wrapTool = (tool: Tool): CustomTool => ({
    name: tool.name,
    // ... map other properties
  });

  wrapTools = (tools: Tool[]): CustomTool[] => tools.map(tool => this.wrapTool(tool));

  async executeToolCall(
    userId: string,
    tool: { name: string; arguments: unknown },
    options: pppppp,
    modifiers?: ExecuteToolModifiers
  ): Promise<string> {
    const result = await this.executeTool(
      tool.name,
      {
        arguments: tool.arguments,
        userId,
        ...options,
      },
      modifiers
    );
    return JSON.stringify(result);
  }
}
```

To quickly create a new toolset project, use the provided script:

```bash
# Create a non-agentic toolset
pnpm create-toolset my-toolset

# Create an agentic toolset
pnpm create-toolset my-toolset --agentic
```

## Environment Variables

- `COMPOSIO_API_KEY`: Your Composio API key
- `COMPOSIO_BASE_URL`: Custom API base URL (optional)
- `COMPOSIO_LOGGING_LEVEL`: Logging level (silent, error, warn, info, debug)
- `DEVELOPMENT`: Development mode flag
- `CI`: CI environment flag

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
