# Composio Toolsets

This package contains various toolsets that integrate with Composio's core functionality. Each toolset provides a collection of tools that can be used to interact with different services and APIs.

## Creating a New Toolset

To create a new toolset, you can use the provided script:

```bash
npm run create-toolset <toolset-name>
```

This will create a new toolset with the following structure:
```
<toolset-name>/
├── src/
│   └── index.ts
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

## Toolset Implementation

Each toolset extends the `BaseComposioToolset` class from `@composio/core`. Here's a basic structure of a toolset:

```typescript
import { BaseComposioToolset } from "@composio/core";
import type { Tool, ToolListParams } from "@composio/core";

interface ToolType {
    // Define your tool type here
}

interface ToolCollection {
    // Define your tool collection here
}

export class YourToolset extends BaseComposioToolset<ToolCollection, ToolType> {
    static FRAMEWORK_NAME = "your-toolset";
    private DEFAULT_ENTITY_ID = "default";
    readonly FILE_NAME: string = "toolsets/your-toolset/src/index.ts";

    _wrapTool = (tool: Tool): ToolType => {
        // Implement tool wrapping logic
        return tool as ToolType;
    }

    getTools = async (query?: ToolListParams): Promise<ToolCollection> => {
        // Implement tool collection logic
        return [];
    }
}
```

### Required Methods

1. `_wrapTool`: This method is responsible for wrapping a tool in the toolset's specific format.
2. `getTools`: This method retrieves all available tools from the Composio API.

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

## Example Implementation

Here's a simple example of implementing a toolset:

```typescript
interface MyToolType {
    name: string;
    description: string;
    execute: (params: any) => Promise<any>;
}

interface MyToolCollection {
    [key: string]: MyToolType;
}

export class MyToolset extends BaseComposioToolset<MyToolCollection, MyToolType> {
    static FRAMEWORK_NAME = "my-toolset";
    readonly FILE_NAME:string = "toolsets/MyToolset/src/index.ts"
    
    _wrapTool = (tool: Tool): MyToolType => {
        return {
            name: tool.name,
            description: tool.description,
            execute: async (params) => {
                // Implement tool execution logic
                return await this.executeTool(tool, params);
            }
        };
    }

    getTools = async (query?: ToolListParams): Promise<MyToolCollection> => {
        const tools = await this.listTools(query);
        return tools.reduce((acc, tool) => {
            acc[tool.name] = this._wrapTool(tool);
            return acc;
        }, {} as MyToolCollection);
    }
}
```

## Contributing

When contributing a new toolset:

1. Follow the existing code style and patterns
2. Include proper documentation
3. Add tests for your implementation
4. Update this README if necessary
