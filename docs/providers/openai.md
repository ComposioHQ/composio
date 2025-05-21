# OpenAI Provider

The OpenAI Provider is the default provider for the Composio SDK. It transforms Composio tools into a format compatible with OpenAI's function calling capabilities.

## Overview

The OpenAI Provider allows you to:

1. Format Composio tools as OpenAI function tools
2. Handle tool calls from OpenAI chat completions
3. Handle tool calls from OpenAI assistants
4. Process streaming responses from OpenAI with tool calls

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
  const toolOutputs = await openaiProvider.handleToolCall(
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
      {
        role: 'tool',
        content: toolOutputs[0],
        tool_call_id: completion.choices[0].message.tool_calls[0].id,
      },
    ],
    tools,
  });

  console.log(followupCompletion.choices[0].message.content);
}
```

## Working with OpenAI Assistants

The OpenAI Provider includes helper methods for working with OpenAI Assistants:

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

// Create an assistant with Composio tools
const assistant = await openai.beta.assistants.create({
  name: 'GitHub Assistant',
  instructions: 'You are a helpful assistant with GitHub tools.',
  model: 'gpt-4',
  tools,
});

// Create a thread
const thread = await openai.beta.threads.create();

// Add a message to the thread
await openai.beta.threads.messages.create(thread.id, {
  role: 'user',
  content: 'Find information about the Composio SDK repository',
});

// Run the assistant
const run = await openai.beta.threads.runs.create(thread.id, {
  assistant_id: assistant.id,
});

// Wait for the run to complete and handle any tool calls
const finalRun = await openaiProvider.waitAndHandleAssistantToolCalls(
  'default', // userId
  openai,
  run,
  thread,
  { connectedAccountId: 'connected_account_123' } // Optional
);

// Get the assistant's response
const messages = await openai.beta.threads.messages.list(thread.id);
console.log(messages.data[0].content);
```

## Handling Streaming Responses with Tool Calls

The OpenAI Provider can also handle streaming responses with tool calls:

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

// Create an assistant with Composio tools
const assistant = await openai.beta.assistants.create({
  name: 'GitHub Assistant',
  instructions: 'You are a helpful assistant with GitHub tools.',
  model: 'gpt-4',
  tools,
});

// Create a thread
const thread = await openai.beta.threads.create();

// Add a message to the thread
await openai.beta.threads.messages.create(thread.id, {
  role: 'user',
  content: 'Find information about the Composio SDK repository',
});

// Run the assistant with streaming
const runStream = await openai.beta.threads.runs.createAndStream(thread.id, {
  assistant_id: assistant.id,
});

// Process the stream and handle tool calls
for await (const event of openaiProvider.waitAndHandleAssistantStreamToolCalls(
  'default', // userId
  openai,
  runStream,
  thread,
  { connectedAccountId: 'connected_account_123' } // Optional
)) {
  // Process different event types
  if (event.event === 'thread.message.created') {
    console.log('New message created');
  } else if (event.event === 'thread.message.delta') {
    console.log('Message update:', event.data.delta.content);
  } else if (event.event === 'thread.run.requires_action') {
    console.log('Run requires action (tools being executed)');
  } else if (event.event === 'thread.run.completed') {
    console.log('Run completed');
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
    beforeExecute: (toolSlug, toolkitSlug, params) => {
      console.log(`Executing ${toolSlug} tool`);
      return params;
    },

    // Transform results after execution
    afterExecute: (toolSlug, toolkitSlug, result) => {
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

  handleToolCall(
    userId: string,
    chatCompletion: OpenAI.ChatCompletion,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<string[]>;

  handleAssistantMessage(
    userId: string,
    run: OpenAI.Beta.Threads.Run,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput[]>;

  waitAndHandleAssistantStreamToolCalls(
    userId: string,
    client: OpenAI,
    runStream: Stream<OpenAI.Beta.Assistants.AssistantStreamEvent>,
    thread: OpenAI.Beta.Threads.Thread,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): AsyncGenerator<OpenAI.Beta.Assistants.AssistantStreamEvent, void, unknown>;

  waitAndHandleAssistantToolCalls(
    userId: string,
    client: OpenAI,
    run: OpenAI.Beta.Threads.Run,
    thread: OpenAI.Beta.Threads.Thread,
    options?: ExecuteToolFnOptions,
    modifiers?: ExecuteToolModifiers
  ): Promise<OpenAI.Beta.Threads.Run>;
}
```
