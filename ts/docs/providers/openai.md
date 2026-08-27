# OpenAI Provider

The OpenAI Provider is the default provider for the Composio SDK. It transforms Composio tools into a format compatible with OpenAI's function calling capabilities.

## Overview

The OpenAI Provider allows you to:

1. Format Composio tools as OpenAI function tools
2. Handle tool calls from OpenAI chat completions
3. Handle tool calls from the OpenAI Responses API through `OpenAIResponsesProvider`

## Basic Usage

The OpenAI Provider is used by default when you initialize the Composio SDK:

```typescript
import { Composio } from '@composio/core';

// OpenAI Provider is used by default
const composio = new Composio({
  apiKey: 'your-composio-api-key',
});
```

You can also explicitly specify the OpenAI Provider:

```typescript
import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai';

// Explicitly specify the OpenAI Provider
const composio = new Composio({
  apiKey: 'your-composio-api-key',
  provider: new OpenAIProvider(),
});
```

## Getting Tools for OpenAI

The OpenAI Provider transforms Composio tools into OpenAI function tools:

```typescript
import { Composio } from '@composio/core';
import OpenAI from 'openai';

const composio = new Composio({
  apiKey: 'your-composio-api-key',
});

const openai = new OpenAI({
  apiKey: 'your-openai-api-key',
});

// Get GitHub tools from Composio
const tools = await composio.tools.get('default', {
  toolkits: ['github'],
});

// The tools are already formatted for OpenAI
console.log(tools[0]); // { type: 'function', function: { name: 'GITHUB_GET_REPO', ... } }

// Use the tools with OpenAI
const completion = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are a helpful assistant with GitHub tools.' },
    { role: 'user', content: 'Find information about the Composio SDK repository' },
  ],
  tools, // Pass the tools to OpenAI
});
```

## Handling Tool Calls from OpenAI Chat Completions

When OpenAI's model decides to call a tool, you can use the OpenAI Provider to handle it:

```typescript
import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai';
import OpenAI from 'openai';

const composio = new Composio({
  apiKey: 'your-composio-api-key',
});

const openai = new OpenAI({
  apiKey: 'your-openai-api-key',
});

// Get the OpenAI Provider
const openaiProvider = composio.provider as OpenAIProvider;

// Get GitHub tools
const tools = await composio.tools.get('default', {
  toolkits: ['github'],
});

// Create a chat completion
const completion = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are a helpful assistant with GitHub tools.' },
    { role: 'user', content: 'Find information about the Composio SDK repository' },
  ],
  tools,
});

// Check if there are tool calls
if (completion.choices[0].message.tool_calls) {
  // Handle the tool calls
  const toolOutputs = await openaiProvider.handleToolCalls(
    'default', // userId
    completion,
    { connectedAccountId: 'connected_account_123' } // Optional
  );

  // Continue the conversation with the tool outputs
  const followupCompletion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a helpful assistant with GitHub tools.' },
      { role: 'user', content: 'Find information about the Composio SDK repository' },
      completion.choices[0].message,
      ...toolOutputs,
    ],
    tools,
  });

  console.log(followupCompletion.choices[0].message.content);
}
```

## Working with OpenAI Responses

Use `OpenAIResponsesProvider` for new agentic flows. It formats Composio tools for the Responses API and returns `function_call_output` items that you can pass back with `previous_response_id`.

```typescript
import { Composio } from '@composio/core';
import { OpenAIResponsesProvider } from '@composio/openai';
import OpenAI from 'openai';

const composio = new Composio({
  apiKey: 'your-composio-api-key',
  provider: new OpenAIResponsesProvider(),
});

const openai = new OpenAI({
  apiKey: 'your-openai-api-key',
});

// Get GitHub tools
const tools = await composio.tools.get('default', {
  toolkits: ['github'],
});

let response = await openai.responses.create({
  model: 'gpt-5.2',
  tools,
  input: 'Find information about the Composio SDK repository',
});

while (response.output.some(item => item.type === 'function_call')) {
  const toolOutputs = await composio.provider.handleToolCalls('default', response.output);
  response = await openai.responses.create({
    model: 'gpt-5.2',
    tools,
    previous_response_id: response.id,
    input: toolOutputs,
  });
}

for (const item of response.output) {
  if (item.type === 'message' && item.content[0].type === 'output_text') {
    console.log(item.content[0].text);
  }
}
```

## Modifiers with OpenAI Provider

You can use modifiers with the OpenAI Provider to transform tools and tool execution:

```typescript
import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai';

const composio = new Composio({
  apiKey: 'your-composio-api-key',
});

// Get GitHub tools with modifiers
const tools = await composio.tools.get(
  'default',
  {
    toolkits: ['github'],
  },
  {
    // Modify tool schema
    modifySchema: (toolSlug, toolkitSlug, tool) => {
      // Make tool descriptions more concise for OpenAI
      if (tool.description && tool.description.length > 100) {
        tool.description = tool.description.substring(0, 100) + '...';
      }
      return tool;
    },

    // Modify parameters before execution
    beforeExecute: ({ toolSlug, toolkitSlug, params }) => {
      console.log(`Executing ${toolSlug} tool`);
      return params;
    },

    // Transform results after execution
    afterExecute: ({ toolSlug, toolkitSlug, result }) => {
      // Format the result data for better presentation
      if (result.successful && toolSlug === 'GITHUB_GET_REPO') {
        result.data = {
          name: result.data.name,
          description: result.data.description,
          stars: result.data.stargazers_count,
          forks: result.data.forks_count,
          url: result.data.html_url,
        };
      }
      return result;
    },
  }
);
```

## Type Definitions

The OpenAI Provider exports these types:

```typescript
// OpenAI tool type (matches OpenAI's API)
type OpenAiTool = OpenAI.ChatCompletionTool;

// Collection of OpenAI tools
type OpenAiToolCollection = Array<OpenAiTool>;

// The provider class
class OpenAIProvider extends BaseNonAgenticProvider<OpenAiToolCollection, OpenAiTool> {
  readonly name = 'openai';

  wrapTool(tool: Tool): OpenAiTool;
  wrapTools(tools: Tool[]): OpenAiToolCollection;

  executeToolCall(
    userId: string,
    tool: OpenAI.ChatCompletionMessageToolCall,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<string>;

  handleToolCalls(
    userId: string,
    chatCompletion: OpenAI.ChatCompletion,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<OpenAI.ChatCompletionToolMessageParam[]>;
}
```
