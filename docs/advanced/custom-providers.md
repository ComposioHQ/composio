# Creating Custom Providers

This guide provides a comprehensive walkthrough of creating custom providers for the Composio SDK, enabling integration with different AI frameworks and platforms.

## Provider Architecture

The Composio SDK uses a provider architecture to adapt tools for different AI frameworks. The provider handles:

1. **Tool Format Transformation**: Converting Composio tools into formats compatible with specific AI platforms
2. **Tool Execution**: Managing the flow of tool execution and results
3. **Platform-Specific Integration**: Providing helper methods for seamless integration

## Types of Providers

There are two types of providers:

1. **Non-Agentic Providers**: Transform tools for platforms that don't have their own agency (e.g., OpenAI)
2. **Agentic Providers**: Transform tools for platforms that have their own agency (e.g., LangChain, AutoGPT)

## Provider Class Hierarchy

```
BaseProvider (Abstract)
├── BaseNonAgenticProvider (Abstract)
│   └── OpenAIProvider (Concrete)
│   └── [Your Custom Non-Agentic Provider] (Concrete)
└── BaseAgenticProvider (Abstract)
    └── [Your Custom Agentic Provider] (Concrete)
```

## Creating a Non-Agentic Provider

Non-agentic providers implement the `BaseNonAgenticProvider` abstract class:

```typescript
import { BaseNonAgenticProvider, Tool } from '@composio/sdk';

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

// Create your provider
export class MyAIProvider extends BaseNonAgenticProvider<MyAIToolCollection, MyAITool> {
  // Required: Unique provider name for telemetry
  readonly name = 'my-ai-platform';
  
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
  
  // Optional: Custom helper methods for your AI platform
  async executeMyAIToolCall(
    userId: string,
    toolCall: {
      name: string;
      arguments: Record<string, unknown>;
    }
  ): Promise<string> {
    // Use the built-in executeTool method
    const result = await this.executeTool(
      toolCall.name,
      {
        userId,
        arguments: toolCall.arguments,
      }
    );
    
    return JSON.stringify(result.data);
  }
}
```

## Creating an Agentic Provider

Agentic providers implement the `BaseAgenticProvider` abstract class:

```typescript
import { BaseAgenticProvider, Tool, ExecuteToolFn } from '@composio/sdk';

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

// Create your provider
export class MyAgentProvider extends BaseAgenticProvider<AgentToolkit, AgentTool> {
  // Required: Unique provider name for telemetry
  readonly name = 'my-agent-platform';
  
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
      }
    };
  }
  
  // Required: Method to transform a collection of tools with execute function
  override wrapTools(tools: Tool[], executeToolFn: ExecuteToolFn): AgentToolkit {
    const agentTools = tools.map(tool => this.wrapTool(tool, executeToolFn));
    
    return {
      tools: agentTools,
      createAgent: (config) => {
        // Create an agent using the tools
        return {
          run: async (prompt: string) => {
            // Implementation depends on your agent framework
            console.log(`Running agent with prompt: ${prompt}`);
            // The agent would use the tools.execute method to run tools
          }
        };
      }
    };
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
import { Composio } from '@composio/sdk';
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
import { OpenAIProvider } from '@composio/sdk';

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

Here's a more complete example for Anthropic's Claude:

```typescript
import { BaseNonAgenticProvider, Tool } from '@composio/sdk';
import Anthropic from '@anthropic-ai/sdk';

interface ClaudeTool {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

type ClaudeToolCollection = ClaudeTool[];

export class ClaudeProvider extends BaseNonAgenticProvider<ClaudeToolCollection, ClaudeTool> {
  readonly name = 'claude';
  private client: Anthropic;
  
  constructor(apiKey: string) {
    super();
    this.client = new Anthropic({
      apiKey,
    });
  }
  
  override wrapTool(tool: Tool): ClaudeTool {
    return {
      name: tool.slug,
      description: tool.description || '',
      input_schema: {
        type: 'object',
        properties: tool.inputParameters?.properties || {},
        required: tool.inputParameters?.required || [],
      },
    };
  }
  
  override wrapTools(tools: Tool[]): ClaudeToolCollection {
    return tools.map(tool => this.wrapTool(tool));
  }
  
  // Helper method to create a Claude message with tools
  async createMessage(prompt: string, tools: ClaudeToolCollection, userId: string) {
    const response = await this.client.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 1024,
      system: 'You are a helpful assistant with access to tools.',
      messages: [
        { role: 'user', content: prompt }
      ],
      tools,
    });
    
    // Process tool calls if any
    if (response.content.some(content => 
      content.type === 'tool_use' && 
      'name' in content && 
      'input' in content
    )) {
      const toolResponses = await Promise.all(
        response.content
          .filter(content => content.type === 'tool_use')
          .map(async (content: any) => {
            const result = await this.executeTool(
              content.name,
              {
                userId,
                arguments: content.input,
              }
            );
            
            return {
              type: 'tool_result',
              tool_use_id: content.id,
              content: JSON.stringify(result.data),
            };
          })
      );
      
      // Continue the conversation with tool results
      const followupResponse = await this.client.messages.create({
        model: 'claude-3-opus-20240229',
        max_tokens: 1024,
        system: 'You are a helpful assistant with access to tools.',
        messages: [
          { role: 'user', content: prompt },
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResponses }
        ],
        tools,
      });
      
      return followupResponse;
    }
    
    return response;
  }
}
```

## Example: LangChain Provider

Here's an example for LangChain:

```typescript
import { BaseAgenticProvider, Tool, ExecuteToolFn } from '@composio/sdk';
import { DynamicTool } from 'langchain/tools';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { initializeAgentExecutorWithOptions } from 'langchain/agents';

interface LangChainTool extends DynamicTool {
  name: string;
  description: string;
  func: (input: Record<string, unknown>) => Promise<string>;
}

interface LangChainToolkit {
  tools: LangChainTool[];
  createExecutor: (options: { model: string }) => Promise<any>;
}

export class LangChainProvider extends BaseAgenticProvider<LangChainToolkit, LangChainTool> {
  readonly name = 'langchain';
  
  override wrapTool(tool: Tool, executeToolFn: ExecuteToolFn): LangChainTool {
    return new DynamicTool({
      name: tool.slug,
      description: tool.description || '',
      func: async (input: string) => {
        try {
          // Parse input from string to object
          const args = typeof input === 'string' ? JSON.parse(input) : input;
          
          // Execute the tool
          const result = await executeToolFn(tool.slug, args);
          
          if (!result.successful) {
            throw new Error(result.error || 'Tool execution failed');
          }
          
          // Return the result
          return JSON.stringify(result.data);
        } catch (error) {
          return `Error: ${error.message}`;
        }
      }
    }) as LangChainTool;
  }
  
  override wrapTools(tools: Tool[], executeToolFn: ExecuteToolFn): LangChainToolkit {
    const langchainTools = tools.map(tool => this.wrapTool(tool, executeToolFn));
    
    return {
      tools: langchainTools,
      createExecutor: async ({ model }) => {
        const llm = new ChatOpenAI({
          modelName: model || 'gpt-4',
          temperature: 0,
        });
        
        return await initializeAgentExecutorWithOptions(
          langchainTools,
          llm,
          {
            agentType: 'chat-zero-shot-react-description',
            verbose: true,
          }
        );
      }
    };
  }
  
  // Helper method to run the agent
  async runAgent(
    toolkit: LangChainToolkit,
    prompt: string,
    model = 'gpt-4'
  ): Promise<string> {
    const executor = await toolkit.createExecutor({ model });
    const result = await executor.call({ input: prompt });
    return result.output;
  }
}
```

## Best Practices

1. **Keep providers focused**: Each provider should integrate with one specific platform
2. **Handle errors gracefully**: Catch and transform errors from tool execution
3. **Follow platform conventions**: Adopt naming and structural conventions of the target platform
4. **Optimize for performance**: Cache transformed tools when possible
5. **Add helper methods**: Provide convenient methods for common platform-specific operations
6. **Provide clear documentation**: Document your provider's unique features and usage
7. **Use telemetry**: Set a meaningful provider name for telemetry insights