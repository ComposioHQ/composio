# Creating Custom Providers

This guide provides a comprehensive walkthrough of creating custom providers for the Composio SDK, enabling integration with different AI frameworks and platforms.

## Provider Architecture

The Composio SDK uses a provider architecture to adapt tools for different AI frameworks. The provider handles:

1. **Tool Format Transformation**: Converting Composio tools into formats compatible with specific AI platforms
2. **Tool Execution**: Managing the flow of tool execution and results through the `executeTool` method
3. **Platform-Specific Integration**: Providing helper methods for seamless integration
4. **MCP Server Support**: Optional transformation of MCP server responses

## Types of Providers

There are two types of providers:

1. **Non-Agentic Providers**: Transform tools for platforms that don't have their own agency (e.g., OpenAI, Anthropic, Google)
2. **Agentic Providers**: Transform tools for platforms that have their own agency (e.g., LangChain)

## Provider Class Hierarchy

```
BaseProvider<TMcpResponse> (Abstract)
├── BaseNonAgenticProvider<TToolCollection, TTool, TMcpResponse> (Abstract)
│   ├── OpenAIProvider (Concrete - ships with @composio/core)
│   ├── AnthropicProvider (Concrete - @composio/anthropic)
│   ├── GoogleProvider (Concrete - @composio/google)
│   └── [Your Custom Non-Agentic Provider] (Concrete)
└── BaseAgenticProvider<TToolCollection, TTool, TMcpResponse> (Abstract)
    ├── LangchainProvider (Concrete - @composio/langchain)
    └── [Your Custom Agentic Provider] (Concrete)
```

## Creating a Non-Agentic Provider

Non-agentic providers extend the `BaseNonAgenticProvider` abstract class. Here's how to create one:

```typescript
import {
  BaseNonAgenticProvider,
  Tool,
  ToolExecuteParams,
  ExecuteToolModifiers,
  ExecuteToolFnOptions,
  McpUrlResponse,
  McpServerGetResponse,
} from '@composio/core';

// Define your tool format
interface MyAITool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// Define your tool collection format
type MyAIToolCollection = MyAITool[];

// Optional: Define custom MCP response format
type MyAIMcpResponse = {
  url: string;
  name: string;
  type: 'url';
}[];

// Create your provider
export class MyAIProvider extends BaseNonAgenticProvider<
  MyAIToolCollection,
  MyAITool,
  MyAIMcpResponse
> {
  // Required: Unique provider name for telemetry
  readonly name = 'my-ai-platform';

  /**
   * Creates a new instance of MyAIProvider.
   */
  constructor() {
    super();
  }

  // Required: Method to transform a single tool
  override wrapTool(tool: Tool): MyAITool {
    return {
      name: tool.slug,
      description: tool.description || '',
      parameters: {
        type: 'object',
        properties: tool.inputParameters?.properties || {},
        required: tool.inputParameters?.required || [],
      },
    };
  }

  // Required: Method to transform a collection of tools
  override wrapTools(tools: Tool[]): MyAIToolCollection {
    return tools.map(tool => this.wrapTool(tool));
  }

  // Optional: Transform MCP server responses to your format
  wrapMcpServerResponse(data: McpUrlResponse): MyAIMcpResponse {
    return data.map(item => ({
      url: item.url,
      name: item.name,
      type: 'url',
    }));
  }

  // Optional: Custom helper methods for your AI platform
  async executeMyAIToolCall(
    userId: string,
    toolCall: {
      name: string;
      arguments: Record<string, unknown>;
    },
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<string> {
    // Use the built-in executeTool method
    const payload: ToolExecuteParams = {
      arguments: toolCall.arguments,
      connectedAccountId: options?.connectedAccountId,
      customAuthParams: options?.customAuthParams,
      customConnectionData: options?.customConnectionData,
      userId: userId,
    };

    const result = await this.executeTool(toolCall.name, payload, modifiers);
    return JSON.stringify(result.data);
  }

  // Optional: Handle multiple tool calls from your AI platform
  async handleMyAIToolCalls(
    userId: string,
    toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<string[]> {
    const results = await Promise.all(
      toolCalls.map(toolCall => this.executeMyAIToolCall(userId, toolCall, options, modifiers))
    );
    return results;
  }
}
```

## Creating an Agentic Provider

Agentic providers extend the `BaseAgenticProvider` abstract class. The key difference is that agentic providers receive an `ExecuteToolFn` to handle tool execution:

```typescript
import {
  BaseAgenticProvider,
  Tool,
  ExecuteToolFn,
  McpUrlResponse,
  McpServerGetResponse,
} from '@composio/core';

// Define your tool format
interface AgentTool {
  name: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
  schema: Record<string, unknown>;
}

// Define your tool collection format
interface AgentToolkit {
  tools: AgentTool[];
  createAgent: (config: Record<string, unknown>) => unknown;
}

// Optional: Define custom MCP response format
type MyAgentMcpResponse = {
  url: URL;
  name: string;
}[];

// Create your provider
export class MyAgentProvider extends BaseAgenticProvider<
  AgentToolkit,
  AgentTool,
  MyAgentMcpResponse
> {
  // Required: Unique provider name for telemetry
  readonly name = 'my-agent-platform';

  /**
   * Creates a new instance of MyAgentProvider.
   */
  constructor() {
    super();
  }

  // Required: Method to transform a single tool with execute function
  override wrapTool(tool: Tool, executeToolFn: ExecuteToolFn): AgentTool {
    return {
      name: tool.slug,
      description: tool.description || '',
      schema: tool.inputParameters || {},
      execute: async (args: Record<string, unknown>) => {
        const result = await executeToolFn(tool.slug, args);
        if (!result.successful) {
          throw new Error(result.error || 'Tool execution failed');
        }
        return result.data;
      },
    };
  }

  // Required: Method to transform a collection of tools with execute function
  override wrapTools(tools: Tool[], executeToolFn: ExecuteToolFn): AgentToolkit {
    const agentTools = tools.map(tool => this.wrapTool(tool, executeToolFn));

    return {
      tools: agentTools,
      createAgent: config => {
        // Create an agent using the tools
        return {
          run: async (prompt: string) => {
            // Implementation depends on your agent framework
            console.log(`Running agent with prompt: ${prompt}`);
            // The agent would use the tools.execute method to run tools
          },
        };
      },
    };
  }

  // Optional: Transform MCP server responses to your format
  wrapMcpServerResponse(data: McpUrlResponse): MyAgentMcpResponse {
    return data.map(item => ({
      url: new URL(item.url),
      name: item.name,
    }));
  }

  // Optional: Custom helper methods for your agent platform
  async runAgent(agentToolkit: AgentToolkit, prompt: string): Promise<unknown> {
    const agent = agentToolkit.createAgent({});
    return await agent.run(prompt);
  }
}
```

## Using Your Custom Provider

After creating your provider, use it with the Composio SDK:

```typescript
import { Composio } from '@composio/core';
import { MyAIProvider } from './my-ai-provider';

// Create your provider instance
const myProvider = new MyAIProvider();

// Initialize Composio with your provider
const composio = new Composio({
  apiKey: 'your-composio-api-key',
  provider: myProvider,
});

// Get tools - they will be transformed by your provider
const tools = await composio.tools.get('default', {
  toolkits: ['github'],
});

// Use the tools with your AI platform
console.log(tools); // These will be in your custom format
```

## Provider State and Context

Your provider can maintain state and context:

```typescript
export class StatefulProvider extends BaseNonAgenticProvider<ToolCollection, Tool> {
  readonly name = 'stateful-provider';

  // Provider state
  private requestCount = 0;
  private toolCache = new Map<string, any>();
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    super();
    this.config = config;
  }

  override wrapTool(tool: Tool): ProviderTool {
    this.requestCount++;

    // Use the provider state/config
    const enhancedTool = {
      // Transform the tool
      name: this.config.useUpperCase ? tool.slug.toUpperCase() : tool.slug,
      description: tool.description,
      schema: tool.inputParameters,
    };

    // Cache the transformed tool
    this.toolCache.set(tool.slug, enhancedTool);

    return enhancedTool;
  }

  override wrapTools(tools: Tool[]): ProviderToolCollection {
    return tools.map(tool => this.wrapTool(tool));
  }

  // Custom methods that use provider state
  getRequestCount(): number {
    return this.requestCount;
  }

  getCachedTool(slug: string): ProviderTool | undefined {
    return this.toolCache.get(slug);
  }
}
```

## Advanced: Provider Composition

You can compose functionality by extending existing providers:

```typescript
import { OpenAIProvider } from '@composio/openai';

// Extend the OpenAI provider with custom functionality
export class EnhancedOpenAIProvider extends OpenAIProvider {
  // Add properties
  private analytics = {
    toolCalls: 0,
    errors: 0,
  };

  // Override methods to add functionality
  override async executeToolCall(userId, tool, options, modifiers) {
    this.analytics.toolCalls++;

    try {
      // Call the parent implementation
      const result = await super.executeToolCall(userId, tool, options, modifiers);
      return result;
    } catch (error) {
      this.analytics.errors++;
      throw error;
    }
  }

  // Add new methods
  getAnalytics() {
    return this.analytics;
  }

  async executeWithRetry(userId, tool, options, modifiers, maxRetries = 3) {
    let attempts = 0;
    let lastError;

    while (attempts < maxRetries) {
      try {
        return await this.executeToolCall(userId, tool, options, modifiers);
      } catch (error) {
        lastError = error;
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }

    throw lastError;
  }
}
```

## Example: Anthropic Claude Provider

Here's a real-world example based on the actual Anthropic provider implementation:

```typescript
import {
  BaseNonAgenticProvider,
  Tool,
  ToolExecuteParams,
  ExecuteToolModifiers,
  ExecuteToolFnOptions,
  McpUrlResponse,
} from '@composio/core';
import Anthropic from '@anthropic-ai/sdk';

// Define the tool format for Anthropic
interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  cache_control?: { type: 'ephemeral' };
}

type AnthropicToolCollection = AnthropicTool[];

// Define tool use block type
interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// Define custom MCP response format for Anthropic
type AnthropicMcpServerGetResponse = {
  type: 'url';
  url: string;
  name: string;
}[];

export class AnthropicProvider extends BaseNonAgenticProvider<
  AnthropicToolCollection,
  AnthropicTool,
  AnthropicMcpServerGetResponse
> {
  readonly name = 'anthropic';
  private cacheTools: boolean = false;

  constructor(options?: { cacheTools?: boolean }) {
    super();
    this.cacheTools = options?.cacheTools ?? false;
  }

  override wrapTool(tool: Tool): AnthropicTool {
    return {
      name: tool.slug,
      description: tool.description || '',
      input_schema: (tool.inputParameters || {
        type: 'object',
        properties: {},
        required: [],
      }) as any,
      cache_control: this.cacheTools ? { type: 'ephemeral' } : undefined,
    };
  }

  override wrapTools(tools: Tool[]): AnthropicToolCollection {
    return tools.map(tool => this.wrapTool(tool));
  }

  // Transform MCP URL response into Anthropic-specific format
  wrapMcpServerResponse(data: McpUrlResponse): AnthropicMcpServerGetResponse {
    return data.map(item => ({
      url: item.url,
      name: item.name,
      type: 'url',
    }));
  }

  // Execute a single tool call from Anthropic
  async executeToolCall(
    userId: string,
    toolUse: AnthropicToolUseBlock,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<string> {
    const payload: ToolExecuteParams = {
      arguments: toolUse.input,
      connectedAccountId: options?.connectedAccountId,
      customAuthParams: options?.customAuthParams,
      customConnectionData: options?.customConnectionData,
      userId: userId,
    };
    const result = await this.executeTool(toolUse.name, payload, modifiers);
    return JSON.stringify(result.data);
  }

  // Handle tool calls from Anthropic message response
  async handleToolCalls(
    userId: string,
    message: Anthropic.Message,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<Anthropic.Messages.MessageParam[]> {
    const outputs: Anthropic.Messages.ToolResultBlockParam[] = [];

    // Extract tool use blocks from message content
    const toolUseBlocks: AnthropicToolUseBlock[] = [];
    for (const content of message.content) {
      if (
        typeof content === 'object' &&
        content !== null &&
        'type' in content &&
        content.type === 'tool_use' &&
        'id' in content &&
        'name' in content &&
        'input' in content
      ) {
        toolUseBlocks.push({
          type: 'tool_use',
          id: String(content.id),
          name: String(content.name),
          input: content.input as Record<string, unknown>,
        });
      }
    }

    // Execute each tool call
    for (const toolUse of toolUseBlocks) {
      const toolResult = await this.executeToolCall(userId, toolUse, options, modifiers);
      outputs.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: toolResult,
        cache_control: this.cacheTools ? { type: 'ephemeral' } : undefined,
      });
    }

    return outputs.length > 0 ? [{ role: 'user', content: outputs }] : [];
  }
}
```

## Example: LangChain Provider

Here's a real-world example based on the actual LangChain provider implementation:

```typescript
import {
  BaseAgenticProvider,
  jsonSchemaToZodSchema,
  Tool,
  ExecuteToolFn,
  McpUrlResponse,
  McpServerGetResponse,
} from '@composio/core';
import { DynamicStructuredTool } from '@langchain/core/tools';

export type LangChainToolCollection = Array<DynamicStructuredTool>;

export class LangchainProvider extends BaseAgenticProvider<
  LangChainToolCollection,
  DynamicStructuredTool
> {
  readonly name = 'langchain';

  constructor() {
    super();
  }

  // Transform MCP URL response into standard format
  wrapMcpServerResponse(data: McpUrlResponse): McpServerGetResponse {
    return data.map(item => ({
      url: new URL(item.url),
      name: item.name,
    })) as McpServerGetResponse;
  }

  override wrapTool(tool: Tool, executeTool: ExecuteToolFn): DynamicStructuredTool {
    const toolName = tool.slug;
    const description = tool.description;
    const appName = tool.toolkit?.name?.toLowerCase();
    
    if (!appName) {
      throw new Error('App name is not defined');
    }
    
    if (!tool.inputParameters) {
      throw new Error('Tool input parameters are not defined');
    }

    // Convert JSON schema to Zod schema for LangChain
    const parameters = jsonSchemaToZodSchema(tool.inputParameters);
    
    const func = async (...args: unknown[]): Promise<unknown> => {
      const result = await executeTool(toolName, args[0] as Record<string, unknown>);
      return JSON.stringify(result);
    };

    return new DynamicStructuredTool({
      name: toolName,
      description: description || '',
      schema: parameters,
      func: func,
    });
  }

  override wrapTools(tools: Tool[], executeTool: ExecuteToolFn): LangChainToolCollection {
    return tools.map(tool => this.wrapTool(tool, executeTool));
  }
}
```

### Usage with LangChain

```typescript
import { Composio } from '@composio/core';
import { LangchainProvider } from '@composio/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

// Initialize Composio with LangChain provider
const composio = new Composio({
  apiKey: 'your-composio-api-key',
  provider: new LangchainProvider()
});

// Get tools for LangChain
const tools = await composio.tools.get('user123', {
  toolkits: ['github']
});

// Create LangChain agent
const llm = new ChatOpenAI({
  modelName: 'gpt-4',
  temperature: 0
});

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a helpful assistant with access to GitHub tools.'],
  ['human', '{input}'],
  new MessagesPlaceholder('agent_scratchpad')
]);

const agent = await createOpenAIFunctionsAgent({
  llm,
  tools,
  prompt
});

const agentExecutor = new AgentExecutor({
  agent,
  tools,
  verbose: true
});

// Use the agent
const result = await agentExecutor.invoke({
  input: 'Create a new GitHub repository called "my-project"'
});

console.log(result.output);
```

## Best Practices

1. **Keep providers focused**: Each provider should integrate with one specific platform
2. **Handle errors gracefully**: Catch and transform errors from tool execution in your helper methods
3. **Follow platform conventions**: Adopt naming and structural conventions of the target platform
4. **Implement proper types**: Use TypeScript generics to ensure type safety for your tool formats
5. **Add helper methods**: Provide convenient methods for common platform-specific operations like `executeToolCall` and `handleToolCalls`
6. **Support MCP servers**: Implement `wrapMcpServerResponse` if your platform needs custom MCP server response formatting
7. **Use the built-in executeTool method**: Always use `this.executeTool()` for tool execution rather than implementing your own
8. **Provide clear documentation**: Document your provider's unique features and usage patterns
9. **Use meaningful provider names**: Set a descriptive provider name for telemetry and debugging
10. **Handle authentication properly**: Pass through `ExecuteToolFnOptions` for connected accounts and custom auth parameters

## Key Implementation Notes

- **Non-agentic providers** receive tools and transform them for direct use with AI platforms
- **Agentic providers** receive both tools and an `ExecuteToolFn` to create autonomous agents
- The `executeTool` method is injected by the Composio core and handles all authentication and execution logic
- MCP server support is optional but recommended for providers that need custom server response formatting
- All providers should extend the appropriate base class and implement the required abstract methods
