# Composio Providers

This directory contains various providers that implement the Composio SDK for different platforms and frameworks. Each provider provides a way to interact with the Composio Platform using the specific platform's conventions and requirements.

## Types of Providers

Composio SDK supports two types of providers, each with different modifier capabilities:

### 1. Non-Agentic Providers

These providers only support schema modifiers for transforming tool schemas. They are suitable for simple integrations like OpenAI, Anthropic, etc.

Example implementation:

```typescript
import { BaseNonAgenticProvider } from '@composio/core';
import type { Tool, SchemaModifiersParams } from '@composio/core';

export class NonAgenticProvider extends BaseNonAgenticProvider {
  async wrapTool(toolSlug: string, tool: Tool, modifiers?: SchemaModifiersParams): Promise<Tool> {
    // Apply schema modifiers if provided
    if (modifiers?.schema) {
      return modifiers.schema(toolSlug, tool);
    }
    return tool;
  }

  async getTools(): Promise<Tool[]> {
    // Fetch tools from Composio API
    const response = await this.client.getTools();
    return response.data;
  }

  async getToolBySlug(slug: string, modifiers?: SchemaModifiersParams): Promise<Tool> {
    // Fetch tool from Composio API
    const response = await this.client.getToolBySlug(slug);
    // Apply schema modifiers if provided
    return this.wrapTool(slug, response.data, modifiers);
  }
}
```

### 2. Agentic Providers

These providers support full modifier capabilities, making them suitable for complex integrations like Vercel, Langchain, etc. They support:

1. **Schema Modifiers**: Transform tool schemas using `TransformToolSchemaModifier`
2. **Execution Modifiers**: Transform tool execution behavior
   - `beforeToolExecute`: Transform input parameters before execution
   - `afterToolExecute`: Transform output after execution
3. **Execute Modifiers**: Used during tool execution
   - `beforeToolExecute`: Transform input parameters
   - `afterToolExecute`: Transform output

Example implementation:

```typescript
import { BaseAgenticProvider } from '@composio/core';
import type { Tool, ModifiersParams, ToolExecuteParams, ToolExecuteResponse } from '@composio/core';

export class AgenticProvider extends BaseAgenticProvider {
  async wrapTool(toolSlug: string, tool: Tool, modifiers?: ModifiersParams): Promise<Tool> {
    let wrappedTool = tool;

    // Apply schema modifiers if provided
    if (modifiers?.schema) {
      wrappedTool = modifiers.schema(toolSlug, wrappedTool);
    }

    return wrappedTool;
  }

  async getTools(modifiers?: ModifiersParams): Promise<Tool[]> {
    // Fetch tools from Composio API
    const response = await this.client.getTools();
    // Apply modifiers to each tool
    return Promise.all(response.data.map(tool => this.wrapTool(tool.slug, tool, modifiers)));
  }

  async getToolBySlug(slug: string, modifiers?: ModifiersParams): Promise<Tool> {
    // Fetch tool from Composio API
    const response = await this.client.getToolBySlug(slug);
    // Apply modifiers
    return this.wrapTool(slug, response.data, modifiers);
  }

  async executeTool(
    tool: Tool,
    params: ToolExecuteParams,
    modifiers?: ModifiersParams
  ): Promise<ToolExecuteResponse> {
    let executeParams = params;

    // Apply beforeToolExecute modifier if provided
    if (modifiers?.beforeToolExecute) {
      executeParams = modifiers.beforeToolExecute(tool.slug, executeParams);
    }

    // Execute the tool
    const response = await this.client.executeTool(tool.slug, executeParams);

    // Apply afterToolExecute modifier if provided
    if (modifiers?.afterToolExecute) {
      return modifiers.afterToolExecute(tool.slug, response.data);
    }

    return response.data;
  }
}
```

## Creating a New Provider

To create a new provider, you can use the provided script:

```bash
# Create a non-agentic provider (default)
pnpm run create-provider <your-provider-name>

# Create an agentic provider
pnpm run create-provider <your-provider-name> --agentic
```

The script will create a new provider with the following structure:

```
<provider-name>/
├── src/
│   └── index.ts      # Provider implementation
├── package.json      # Package configuration
├── tsconfig.json     # TypeScript configuration
├── tsup.config.ts    # Build configuration
└── README.md         # Provider documentation
```

## Required Methods

Each provider must implement the following methods:

### For Non-Agentic Providers

```typescript
class NonAgenticProvider extends BaseNonAgenticProvider {
  // Wrap a tool with schema modifiers
  async wrapTool(toolSlug: string, tool: Tool, modifiers?: SchemaModifiersParams): Promise<Tool>;

  // Get all available tools
  async getTools(modifiers?: SchemaModifiersParams): Promise<Tool[]>;

  // Get a specific tool by slug
  async getToolBySlug(slug: string, modifiers?: SchemaModifiersParams): Promise<Tool>;
}
```

### For Agentic Providers

```typescript
class AgenticProvider extends BaseAgenticProvider {
  // Wrap a tool with modifiers
  async wrapTool(toolSlug: string, tool: Tool, modifiers?: ModifiersParams): Promise<Tool>;

  // Get all available tools
  async getTools(modifiers?: ModifiersParams): Promise<Tool[]>;

  // Get a specific tool by slug
  async getToolBySlug(slug: string, modifiers?: ModifiersParams): Promise<Tool>;

  // Execute a tool with modifiers
  async executeTool(
    tool: Tool,
    params: ToolExecuteParams,
    modifiers?: ModifiersParams
  ): Promise<ToolExecuteResponse>;
}
```

## Modifier Types

### Schema Modifiers (Both Types)

```typescript
type SchemaModifiersParams = {
  schema?: TransformToolSchemaModifier;
};

type TransformToolSchemaModifier = (toolSlug: string, tool: Tool) => Tool;
```

### Execution Modifiers (Agentic Only)

```typescript
type ModifiersParams = {
  schema?: TransformToolSchemaModifier;
  beforeToolExecute?: BeforeToolExecuteModifier;
  afterToolExecute?: AfterToolExecuteModifier;
};

type BeforeToolExecuteModifier = (toolSlug: string, params: ToolExecuteParams) => ToolExecuteParams;
type AfterToolExecuteModifier = (
  toolSlug: string,
  response: ToolExecuteResponse
) => ToolExecuteResponse;
```

## Best Practices

1. **Type Safety**: Always use TypeScript and ensure proper type definitions for all methods and parameters.
2. **Error Handling**: Implement proper error handling for API calls and tool execution.
3. **Documentation**: Document your provider's features, requirements, and usage examples.
4. **Testing**: Write tests for your provider implementation.
5. **Modifier Support**:
   - For non-agentic providers, implement schema modifiers to transform tool schemas
   - For agentic providers, implement both schema and execution modifiers for full control over tool behavior

## Example Implementation

Here's a complete example of a non-agentic provider implementation:

```typescript
import { BaseNonAgenticProvider } from '@composio/core';
import type { Tool, SchemaModifiersParams } from '@composio/core';

export class OpenAIProvider extends BaseNonAgenticProvider {
  async wrapTool(toolSlug: string, tool: Tool, modifiers?: SchemaModifiersParams): Promise<Tool> {
    // Apply schema modifiers if provided
    if (modifiers?.schema) {
      return modifiers.schema(toolSlug, tool);
    }
    return tool;
  }

  async getTools(modifiers?: SchemaModifiersParams): Promise<Tool[]> {
    // Fetch tools from Composio API
    const response = await this.client.getTools();
    // Apply modifiers to each tool
    return Promise.all(response.data.map(tool => this.wrapTool(tool.slug, tool, modifiers)));
  }

  async getToolBySlug(slug: string, modifiers?: SchemaModifiersParams): Promise<Tool> {
    // Fetch tool from Composio API
    const response = await this.client.getToolBySlug(slug);
    // Apply modifiers
    return this.wrapTool(slug, response.data, modifiers);
  }
}
```

And here's a complete example of an agentic provider implementation:

```typescript
import { BaseAgenticProvider } from '@composio/core';
import type { Tool, ModifiersParams, ToolExecuteParams, ToolExecuteResponse } from '@composio/core';

export class VercelProvider extends BaseAgenticProvider {
  async wrapTool(toolSlug: string, tool: Tool, modifiers?: ModifiersParams): Promise<Tool> {
    let wrappedTool = tool;

    // Apply schema modifiers if provided
    if (modifiers?.schema) {
      wrappedTool = modifiers.schema(toolSlug, wrappedTool);
    }

    return wrappedTool;
  }

  async getTools(modifiers?: ModifiersParams): Promise<Tool[]> {
    // Fetch tools from Composio API
    const response = await this.client.getTools();
    // Apply modifiers to each tool
    return Promise.all(response.data.map(tool => this.wrapTool(tool.slug, tool, modifiers)));
  }

  async getToolBySlug(slug: string, modifiers?: ModifiersParams): Promise<Tool> {
    // Fetch tool from Composio API
    const response = await this.client.getToolBySlug(slug);
    // Apply modifiers
    return this.wrapTool(slug, response.data, modifiers);
  }

  async executeTool(
    tool: Tool,
    params: ToolExecuteParams,
    modifiers?: ModifiersParams
  ): Promise<ToolExecuteResponse> {
    let executeParams = params;

    // Apply beforeToolExecute modifier if provided
    if (modifiers?.beforeToolExecute) {
      executeParams = modifiers.beforeToolExecute(tool.slug, executeParams);
    }

    // Execute the tool
    const response = await this.client.executeTool(tool.slug, executeParams);

    // Apply afterToolExecute modifier if provided
    if (modifiers?.afterToolExecute) {
      return modifiers.afterToolExecute(tool.slug, response.data);
    }

    return response.data;
  }
}
```

## Usage Examples

### Using a Non-Agentic Provider

```typescript
import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai-provider';
import type { Tool } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new OpenAIProvider(),
});

// Get a tool with schema modifiers
const tool = await composio.getToolBySlug('HACKERNEWS_SEARCH_POSTS', {
  schema: (toolSlug: string, tool: Tool) => ({
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

### Using an Agentic Provider

```typescript
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel-provider';
import type { Tool, ToolExecuteParams, ToolExecuteResponse } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

// Get a tool with full modifier support
const tool = await composio.getToolBySlug('HACKERNEWS_SEARCH_POSTS', {
  // Schema modifier
  schema: (toolSlug: string, tool: Tool) => ({
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

// Execute the tool with execution modifiers
const result = await composio.provider.executeTool(
  tool,
  {
    arguments: { query: 'AI', limit: 20 },
  },
  {
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
  }
);
```
