# Providers API

Providers are adapters that allow Composio tools to be used with different AI platforms. The SDK comes with a default OpenAI provider and supports creating custom providers.

## Base Provider Classes

Composio provides abstract base classes for creating providers:

### BaseComposioProvider

The base type for all providers:

```typescript
type BaseComposioProvider<TToolCollection, TTool> =
  | BaseNonAgenticProvider<TToolCollection, TTool>
  | BaseAgenticProvider<TToolCollection, TTool>;
```

### BaseNonAgenticProvider

Base class for non-agentic providers (those that don't have their own agency/autonomy):

```typescript
abstract class BaseNonAgenticProvider<TToolCollection, TTool> extends BaseProvider {
  readonly _isAgentic = false;

  // Wrap a tool in the provider specific format
  abstract wrapTool(tool: Tool): TTool;

  // Wrap a list of tools in the provider specific format
  abstract wrapTools(tools: Tool[]): TToolCollection;
}
```

### BaseAgenticProvider

Base class for agentic providers (those with their own agency/autonomy):

```typescript
abstract class BaseAgenticProvider<TToolCollection, TTool> extends BaseProvider {
  readonly _isAgentic = true;

  // Wrap a tool in the provider specific format
  abstract wrapTool(tool: Tool, executeTool: ExecuteToolFn): TTool;

  // Wrap a list of tools in the provider specific format
  abstract wrapTools(tools: Tool[], executeTool: ExecuteToolFn): TToolCollection;
}
```

## OpenAI Provider

The default provider for Composio SDK is the OpenAI Provider, which formats tools for use with OpenAI's API.

```typescript
import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai';

const composio = new Composio({
  apiKey: 'your-api-key',
  provider: new OpenAIProvider(),
});
```

### Methods

#### wrapTool(tool)

Transforms a Composio tool into an OpenAI function tool format.

```typescript
const openaiTool = openaiProvider.wrapTool(composioTool);
```

**Parameters:**

- `tool` (Tool): The Composio tool to transform

**Returns:** OpenAI.ChatCompletionTool - The tool in OpenAI format

#### wrapTools(tools)

Transforms a list of Composio tools into an array of OpenAI function tools.

```typescript
const openaiTools = openaiProvider.wrapTools(composioTools);
```

**Parameters:**

- `tools` (Tool[]): The list of Composio tools to transform

**Returns:** Array<OpenAI.ChatCompletionTool> - The tools in OpenAI format

#### executeToolCall(userId, tool, options?, modifiers?)

Executes a tool call from an OpenAI chat completion.

```typescript
const result = await openaiProvider.executeToolCall(
  'user123',
  toolCall,
  { connectedAccountId: 'conn_abc123' },
  {
    beforeExecute: ({ toolSlug, toolkitSlug, params }) => params,
    afterExecute: ({ toolSlug, toolkitSlug, result }) => result,
  }
);
```

**Parameters:**

- `userId` (string): The user ID
- `tool` (OpenAI.ChatCompletionMessageToolCall): The tool call from OpenAI
- `options` (ExecuteToolFnOptions): Optional parameters for tool execution
- `modifiers` (ExecuteToolModifiers): Optional modifiers for request/response transformation

**Returns:** Promise<string> - The result of the tool call as JSON string

#### handleToolCalls(userId, chatCompletion, options?, modifiers?)

Handles tool calls from an OpenAI chat completion.

```typescript
const outputs = await openaiProvider.handleToolCalls('user123', chatCompletion);
```

**Parameters:**

- `userId` (string): The user ID
- `chatCompletion` (OpenAI.ChatCompletion): The chat completion containing tool calls
- `options` (ExecuteToolFnOptions): Optional parameters for tool execution
- `modifiers` (ExecuteToolModifiers): Optional modifiers for request/response transformation

**Returns:** Promise<OpenAI.ChatCompletionToolMessageParam[]> - The results of the tool calls

### OpenAIResponsesProvider

OpenAI shut down the Assistants API on August 26, 2026, and the SDK no longer ships its helpers (`handleAssistantMessage`, `waitAndHandleAssistantToolCalls`, `waitAndHandleAssistantStreamToolCalls`). Use `OpenAIResponsesProvider` from `@composio/openai` with the [Responses API](https://developers.openai.com/api/docs/assistants/migration) instead.

```typescript
import { Composio } from '@composio/core';
import { OpenAIResponsesProvider } from '@composio/openai';
import OpenAI from 'openai';

const openai = new OpenAI();
const composio = new Composio({ provider: new OpenAIResponsesProvider() });
const session = await composio.create('user123');
const tools = await session.tools();

const response = await openai.responses.create({
  model: 'gpt-5',
  input: 'Star the composiohq/composio repository on GitHub',
  tools,
});
const toolOutputs = await composio.provider.handleResponse(session, response);
```

`executeToolCall`, `handleToolCalls`, and `handleResponse` take the session that produced the tools, or a user ID for tools fetched with `tools.get()`. They return `function_call_output` items to send back with `previous_response_id`.

## Creating Custom Providers

You can create custom providers by extending either `BaseNonAgenticProvider` or `BaseAgenticProvider`:

```typescript
import { BaseNonAgenticProvider, Tool } from '@composio/core';

type AnthropicTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

type AnthropicToolCollection = AnthropicTool[];

export class AnthropicProvider extends BaseNonAgenticProvider<
  AnthropicToolCollection,
  AnthropicTool
> {
  readonly name = 'anthropic';

  override wrapTool(tool: Tool): AnthropicTool {
    return {
      name: tool.slug,
      description: tool.description || '',
      parameters: tool.inputParameters || {},
    };
  }

  override wrapTools(tools: Tool[]): AnthropicToolCollection {
    return tools.map(tool => this.wrapTool(tool));
  }

  // Additional methods for handling Anthropic-specific functionality
}
```

## Types

### ExecuteToolFn

```typescript
type ExecuteToolFn = (
  toolSlug: string,
  input: Record<string, unknown>
) => Promise<ToolExecuteResponse>;
```

### ExecuteToolFnOptions

```typescript
interface ExecuteToolFnOptions {
  connectedAccountId?: string;
  customAuthParams?: CustomAuthParams;
}
```

### ExecuteToolModifiers

```typescript
interface ExecuteToolModifiers {
  beforeExecute?: beforeExecuteModifier;
  afterExecute?: afterExecuteModifier;
}
```

### TransformToolSchemaModifier

```typescript
type TransformToolSchemaModifier = (toolSlug: string, toolkitSlug: string, tool: Tool) => Tool;
```

### beforeExecuteModifier

```typescript
type beforeExecuteModifier = (
  toolSlug: string,
  toolkitSlug: string,
  params: ToolExecuteParams
) => ToolExecuteParams;
```

### afterExecuteModifier

```typescript
type afterExecuteModifier = (
  toolSlug: string,
  toolkitSlug: string,
  result: ToolExecuteResponse
) => ToolExecuteResponse;
```

// Get tools with filters
const githubTools = await composio.tools.getRawComposioTools({
toolkits: ['github'],
});

// Get tools with schema transformation
const tools = await composio.tools.getRawComposioTools({}, (toolSlug, toolkitSlug, tool) => {
// Add custom properties to tool schema
return { ...tool, customProperty: 'value' };
});
