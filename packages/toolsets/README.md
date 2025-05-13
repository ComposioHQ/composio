# Composio Toolsets

This package contains various toolsets that integrate with Composio's core functionality. Each toolset provides a collection of tools that can be used to interact with different services and APIs.

## Types of Toolsets

Composio SDK supports two types of toolsets:

### 1. Non-Agentic Toolsets

These toolsets only support schema modifiers for transforming tool schemas. They are suitable for simple integrations like OpenAI, Anthropic, etc.

```typescript
import { BaseNonAgenticToolset } from '@composio/core';
import type { Tool, ToolListParams, SchemaModifiersParams } from '@composio/core';

interface ToolType {
  // Define your tool type here
}

interface ToolCollection {
  // Define your tool collection here
}

export class NonAgenticToolset extends BaseNonAgenticToolset<ToolCollection, ToolType> {
  static FRAMEWORK_NAME = 'non-agentic-toolset';
  readonly FILE_NAME: string = 'toolsets/non-agentic-toolset/src/index.ts';

  wrapTool = (tool: Tool): ToolType => {
    // Implement tool wrapping logic
    return tool as ToolType;
  };

  getTools = async (
    params?: ToolListParams,
    modifiers?: SchemaModifiersParams
  ): Promise<ToolCollection> => {
    // Implement tool collection logic
    return [];
  };

  getToolBySlug = async (slug: string, modifiers?: SchemaModifiersParams): Promise<ToolType> => {
    const tool = await this.getComposio().tools.getToolBySlug(slug, modifiers?.schema);
    return this.wrapTool(tool);
  };
}
```

### 2. Agentic Toolsets

These toolsets support full modifier capabilities including tool execution modifiers, schema modifiers, and custom modifiers. They are suitable for more complex integrations like Vercel, Langchain, etc.

```typescript
import { BaseAgenticToolset } from '@composio/core';
import type { Tool, ToolListParams, ModifiersParams } from '@composio/core';

interface ToolType {
  // Define your tool type here
}

interface ToolCollection {
  // Define your tool collection here
}

export class AgenticToolset extends BaseAgenticToolset<ToolCollection, ToolType> {
  static FRAMEWORK_NAME = 'agentic-toolset';
  readonly FILE_NAME: string = 'toolsets/agentic-toolset/src/index.ts';

  wrapTool = (tool: Tool): ToolType => {
    // Implement tool wrapping logic
    return tool as ToolType;
  };

  getTools = async (
    params?: ToolListParams,
    modifiers?: ModifiersParams
  ): Promise<ToolCollection> => {
    // Implement tool collection logic with full modifier support
    return [];
  };

  getToolBySlug = async (slug: string, modifiers?: ModifiersParams): Promise<ToolType> => {
    const tool = await this.getComposio().tools.getToolBySlug(slug, modifiers?.schema);
    return this.wrapTool(tool);
  };
}
```

## Creating a New Toolset

To create a new toolset, you can use the provided script:

```bash
# Create a non-agentic toolset (default)
pnpm run create-toolset <toolset-name>

# Create an agentic toolset
pnpm run create-toolset <toolset-name> --agentic
```

This will create a new toolset with the following structure:

```
<toolset-name>/
├── src/
│   └── index.ts      # Toolset implementation
├── package.json      # Package configuration
├── tsconfig.json     # TypeScript configuration
├── tsup.config.ts    # Build configuration
└── README.md         # Toolset documentation
```

### Required Methods

1. `wrapTool`: This method is responsible for wrapping a tool in the toolset's specific format.
2. `getTools`: This method retrieves all available tools from the Composio API.
3. `getToolBySlug`: This method retrieves a specific tool by its slug.

### Configuration

Each toolset comes with the following configuration files:

- `package.json`: Contains dependencies and build scripts
- `tsconfig.json`: TypeScript configuration
- `tsup.config.ts`: Build configuration for the toolset

## Building and Testing

To build your toolset:

```bash
cd packages/toolsets/<toolset-name>
pnpm build
```

## Best Practices

1. **Type Safety**: Always define proper TypeScript interfaces for your tools and collections
2. **Error Handling**: Implement proper error handling in your tool methods
3. **Documentation**: Document your tools and their parameters clearly
4. **Testing**: Write unit tests for your toolset functionality
5. **Modifier Support**:
   - For non-agentic toolsets, implement schema modifiers to transform tool schemas
   - For agentic toolsets, implement full modifier support including execution and custom modifiers

## Example Implementation

Here's a simple example of implementing a non-agentic toolset:

```typescript
interface MyToolType {
  name: string;
  description: string;
  execute: (params: any) => Promise<any>;
}

interface MyToolCollection {
  [key: string]: MyToolType;
}

export class MyNonAgenticToolset extends BaseNonAgenticToolset<MyToolCollection, MyToolType> {
  static FRAMEWORK_NAME = 'my-toolset';
  readonly FILE_NAME: string = 'toolsets/my-toolset/src/index.ts';

  wrapTool = (tool: Tool): MyToolType => {
    return {
      name: tool.name,
      description: tool.description,
      execute: async params => {
        // Implement tool execution logic
        return await this.getComposio().tools.execute(tool.slug, params);
      },
    };
  };

  getTools = async (
    params?: ToolListParams,
    modifiers?: SchemaModifiersParams
  ): Promise<MyToolCollection> => {
    const tools = await this.getComposio().tools.getTools(params, modifiers?.schema);
    return tools.reduce((acc, tool) => {
      acc[tool.slug] = this.wrapTool(tool);
      return acc;
    }, {} as MyToolCollection);
  };

  getToolBySlug = async (slug: string, modifiers?: SchemaModifiersParams): Promise<MyToolType> => {
    const tool = await this.getComposio().tools.getToolBySlug(slug, modifiers?.schema);
    return this.wrapTool(tool);
  };
}
```

## Contributing

When contributing a new toolset:

1. Follow the existing code style and patterns
2. Include proper documentation
3. Add tests for your implementation
4. Update this README if necessary
5. Choose the appropriate base class (agentic or non-agentic) based on your toolset's needs
