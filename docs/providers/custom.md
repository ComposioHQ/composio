# Creating Custom Providers

Composio SDK allows you to create custom providers to integrate with different AI platforms and frameworks. This guide explains how to create custom providers for both agentic and non-agentic platforms.

## Provider Types

Composio supports two types of providers:

1. **Non-Agentic Providers**: For platforms where the provider simply formats tools but doesn't have its own agency (e.g., OpenAI).
2. **Agentic Providers**: For platforms where the provider has its own agency and can execute tools autonomously (e.g., an agent framework).

## Creating a Non-Agentic Provider

Non-agentic providers extend the `BaseNonAgenticProvider` class:

```typescript
import { BaseNonAgenticProvider, Tool } from '@composio/core';

// Define the tool type for your provider
type AnthropicTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

// Define the collection type for your provider
type AnthropicToolCollection = AnthropicTool[];

// Create the provider class
export class AnthropicProvider extends BaseNonAgenticProvider<
  AnthropicToolCollection,
  AnthropicTool
> {
  // Define the provider name (used for telemetry)
  readonly name = 'anthropic';

  // Implement the wrapTool method
  override wrapTool(tool: Tool): AnthropicTool {
    return {
      name: tool.slug,
      description: tool.description || '',
      parameters: tool.inputParameters || {},
    };
  }

  // Implement the wrapTools method
  override wrapTools(tools: Tool[]): AnthropicToolCollection {
    return tools.map(tool => this.wrapTool(tool));
  }

  // Add provider-specific methods
  async handleToolUsage(userId: string, toolName: string, params: Record<string, unknown>) {
    const result = await this.executeTool(toolName, {
      userId,
      arguments: params,
    });

    return JSON.stringify(result);
  }
}
```

## Creating an Agentic Provider

Agentic providers extend the `BaseAgenticProvider` class:

```typescript
import { BaseAgenticProvider, Tool, ExecuteToolFn } from '@composio/core';

// Define the tool type for your provider
type LangchainTool = {
  name: string;
  description: string;
  func: Function;
};

// Define the collection type for your provider
type LangchainToolset = {
  tools: LangchainTool[];
  executor: (tool: LangchainTool, input: Record<string, unknown>) => Promise<unknown>;
};

// Create the provider class
export class LangchainProvider extends BaseAgenticProvider<LangchainToolset, LangchainTool> {
  // Define the provider name (used for telemetry)
  readonly name = 'langchain';

  // Implement the wrapTool method (note the executeToolFn parameter)
  override wrapTool(tool: Tool, executeToolFn: ExecuteToolFn): LangchainTool {
    return {
      name: tool.slug,
      description: tool.description || '',
      func: async (input: Record<string, unknown>) => {
        const result = await executeToolFn(tool.slug, input);
        return result.data;
      },
    };
  }

  // Implement the wrapTools method (note the executeToolFn parameter)
  override wrapTools(tools: Tool[], executeToolFn: ExecuteToolFn): LangchainToolset {
    const langchainTools = tools.map(tool => this.wrapTool(tool, executeToolFn));

    return {
      tools: langchainTools,
      executor: async (tool, input) => {
        return await tool.func(input);
      },
    };
  }

  // Add provider-specific methods
  async createAgent(tools: LangchainToolset, model: any) {
    // Create a Langchain agent with the tools
    // This is just an example, the actual implementation would depend on the Langchain API
    return {
      run: async (prompt: string) => {
        // Run the agent with the prompt
        // The agent would use the tools.executor to execute tools
      },
    };
  }
}
```

## Using a Custom Provider

Once you've created a custom provider, you can use it with the Composio SDK:

```typescript
import { Composio } from '@composio/core';
import { AnthropicProvider } from './providers/anthropic-provider';

// Create an instance of your custom provider
const anthropicProvider = new AnthropicProvider();

// Initialize Composio with your custom provider
const composio = new Composio({
  apiKey: 'your-composio-api-key',
  provider: anthropicProvider,
});

// Get tools using your custom provider
const tools = await composio.tools.get('default', {
  toolkits: ['github'],
});

// Now you can use these tools with Anthropic's API
// The tools will be formatted according to your provider's implementation
```

## Provider Methods

### Common Methods

Both types of providers have these methods available:

#### executeTool(toolSlug, body, modifiers?)

Executes a tool using the global execute function. This is useful for implementing provider-specific helper methods that need to execute tools.

```typescript
async executeTool(
  toolSlug: string,
  body: ToolExecuteParams,
  modifiers?: ExecuteToolModifiers
): Promise<ToolExecuteResponse>;
```

Example:

```typescript
class MyProvider extends BaseNonAgenticProvider<MyToolCollection, MyTool> {
  // Other methods...

  async executeWithContext(
    userId: string,
    toolSlug: string,
    args: Record<string, unknown>,
    context: string
  ) {
    // Add context to the arguments
    const argsWithContext = { ...args, context };

    // Execute the tool
    return this.executeTool(toolSlug, {
      userId,
      arguments: argsWithContext,
    });
  }
}
```

### Non-Agentic Provider Methods

Non-agentic providers must implement these methods:

#### wrapTool(tool)

Transforms a Composio tool into the provider-specific format.

```typescript
wrapTool(tool: Tool): TTool;
```

#### wrapTools(tools)

Transforms a list of Composio tools into the provider-specific collection format.

```typescript
wrapTools(tools: Tool[]): TToolCollection;
```

### Agentic Provider Methods

Agentic providers must implement these methods:

#### wrapTool(tool, executeToolFn)

Transforms a Composio tool into the provider-specific format, with access to an execute function.

```typescript
wrapTool(tool: Tool, executeToolFn: ExecuteToolFn): TTool;
```

#### wrapTools(tools, executeToolFn)

Transforms a list of Composio tools into the provider-specific collection format, with access to an execute function.

```typescript
wrapTools(tools: Tool[], executeToolFn: ExecuteToolFn): TToolCollection;
```

## Examples

### Claude Provider Example

```typescript
import { BaseNonAgenticProvider, Tool } from '@composio/core';

type ClaudeTool = {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
};

type ClaudeToolCollection = ClaudeTool[];

export class ClaudeProvider extends BaseNonAgenticProvider<ClaudeToolCollection, ClaudeTool> {
  readonly name = 'claude';

  override wrapTool(tool: Tool): ClaudeTool {
    // Convert the input parameters to Claude's format
    const inputSchema = {
      type: 'object',
      properties: tool.inputParameters?.properties || {},
      required: tool.inputParameters?.required || [],
    };

    return {
      name: tool.slug,
      description: tool.description || '',
      input_schema: inputSchema,
    };
  }

  override wrapTools(tools: Tool[]): ClaudeToolCollection {
    return tools.map(tool => this.wrapTool(tool));
  }

  // Helper method for Claude tool execution
  async executeClaudeTool(userId: string, toolName: string, input: Record<string, unknown>) {
    const result = await this.executeTool(toolName, {
      userId,
      arguments: input,
    });

    return result.data;
  }
}
```

### LangChain Provider Example

```typescript
import { BaseAgenticProvider, Tool, ExecuteToolFn } from '@composio/core';

// These types would match the actual LangChain API
type LangChainTool = {
  name: string;
  description: string;
  schema: any;
  call: (input: Record<string, unknown>) => Promise<any>;
};

type LangChainToolset = LangChainTool[];

export class LangChainProvider extends BaseAgenticProvider<LangChainToolset, LangChainTool> {
  readonly name = 'langchain';

  override wrapTool(tool: Tool, executeToolFn: ExecuteToolFn): LangChainTool {
    return {
      name: tool.slug,
      description: tool.description || '',
      schema: tool.inputParameters || {},
      call: async (input: Record<string, unknown>) => {
        const result = await executeToolFn(tool.slug, input);
        if (!result.successful) {
          throw new Error(result.error || 'Tool execution failed');
        }
        return result.data;
      },
    };
  }

  override wrapTools(tools: Tool[], executeToolFn: ExecuteToolFn): LangChainToolset {
    return tools.map(tool => this.wrapTool(tool, executeToolFn));
  }

  // LangChain-specific helper methods
  createAgent(tools: LangChainToolset, model: any) {
    // Implement LangChain agent creation
    // This is just a placeholder - the actual implementation would use the LangChain API
  }
}
```

## Advanced: Provider Context

You can store provider-specific context or state in your provider class:

```typescript
class ProviderWithContext extends BaseNonAgenticProvider<MyToolCollection, MyTool> {
  readonly name = 'provider-with-context';

  // Provider-specific context
  private cache = new Map<string, any>();
  private config: any;

  constructor(config: any) {
    super();
    this.config = config;
  }

  override wrapTool(tool: Tool): MyTool {
    // Use the config when wrapping tools
    const customizedTool = {
      name: tool.slug,
      description: this.config.addDescriptionPrefix
        ? `[${this.config.descriptionPrefix}] ${tool.description}`
        : tool.description,
      // Other properties...
    };

    // Cache the tool for later use
    this.cache.set(tool.slug, customizedTool);

    return customizedTool;
  }

  override wrapTools(tools: Tool[]): MyToolCollection {
    return tools.map(tool => this.wrapTool(tool));
  }

  // Custom method that uses the cache
  getTool(slug: string): MyTool | undefined {
    return this.cache.get(slug);
  }
}
```
