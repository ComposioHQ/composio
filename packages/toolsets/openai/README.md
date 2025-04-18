# @composio/openai

The OpenAI toolset for Composio SDK, providing seamless integration with OpenAI's API and tools.

## Features

- **OpenAI Tool Integration**: Seamlessly integrate OpenAI tools with Composio
- **Tool Execution**: Execute OpenAI tools with proper parameter handling
- **Stream Support**: Handle streaming responses from OpenAI
- **Assistant Integration**: Work with OpenAI Assistants and their tool calls
- **Thread Management**: Manage OpenAI threads and runs

## Installation

```bash
npm install @composio/openai
# or
yarn add @composio/openai
# or
pnpm add @composio/openai
```

## Quick Start

```typescript
import { Composio } from '@composio/core';
import { OpenAIToolset } from '@composio/openai';

// Initialize Composio with OpenAI toolset
const composio = new Composio({
  apiKey: 'your-composio-api-key',
  toolset: new OpenAIToolset()
});

// Get available tools in OpenAI format
const tools = await composio.getTools();

// Execute a tool call
const result = await composio.toolset.executeToolCall(toolCall, 'user-id');
```

## API Reference

### OpenAIToolset Class

The `OpenAIToolset` class extends `BaseComposioToolset` and provides OpenAI-specific functionality.

#### Methods

##### `executeToolCall(tool: OpenAI.ChatCompletionMessageToolCall, userId?: string): Promise<string>`
Executes a tool call from OpenAI and returns the result.

```typescript
const result = await toolset.executeToolCall(toolCall, 'user-id');
```

##### `handleToolCall(chatCompletion: OpenAI.ChatCompletion, userId?: string): Promise<string[]>`
Handles tool calls from a chat completion.

```typescript
const outputs = await toolset.handleToolCall(chatCompletion, 'user-id');
```

##### `handleAssistantMessage(run: OpenAI.Beta.Threads.Run, userId?: string): Promise<OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput[]>`
Handles tool calls from an assistant message.

```typescript
const toolOutputs = await toolset.handleAssistantMessage(run, 'user-id');
```

##### `waitAndHandleAssistantStreamToolCalls(client: OpenAI, runStream: Stream<OpenAI.Beta.Assistants.AssistantStreamEvent>, thread: OpenAI.Beta.Threads.Thread, userId?: string): AsyncGenerator<OpenAI.Beta.Assistants.AssistantStreamEvent, void, unknown>`
Waits for and handles tool calls from an assistant stream.

```typescript
for await (const event of toolset.waitAndHandleAssistantStreamToolCalls(client, runStream, thread, 'user-id')) {
  // Handle events
}
```

##### `waitAndHandleAssistantToolCalls(client: OpenAI, run: OpenAI.Beta.Threads.Run, thread: OpenAI.Beta.Threads.Thread, userId?: string): Promise<OpenAI.Beta.Threads.Run>`
Waits for and handles tool calls from an assistant.

```typescript
const finalRun = await toolset.waitAndHandleAssistantToolCalls(client, run, thread, 'user-id');
```

## Examples

### Basic Tool Execution

```typescript
import { Composio } from '@composio/core';
import { OpenAIToolset } from '@composio/openai';
import OpenAI from 'openai';

const composio = new Composio({
  apiKey: 'your-composio-api-key',
  toolset: new OpenAIToolset()
});

const openai = new OpenAI({
  apiKey: 'your-openai-api-key'
});

// Get available tools
const tools = await composio.getTools();

// Create a chat completion with tools
const completion = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'What can you do?' }],
  tools: tools
});

// Handle tool calls
if (completion.choices[0].message.tool_calls) {
  const result = await composio.toolset.executeToolCall(
    completion.choices[0].message.tool_calls[0],
    'user-id'
  );
  console.log(result);
}
```

### Working with Assistants

```typescript
import { Composio } from '@composio/core';
import { OpenAIToolset } from '@composio/openai';
import OpenAI from 'openai';

const composio = new Composio({
  apiKey: 'your-composio-api-key',
  toolset: new OpenAIToolset()
});

const openai = new OpenAI({
  apiKey: 'your-openai-api-key'
});

// Create an assistant with tools
const assistant = await openai.beta.assistants.create({
  name: 'Composio Assistant',
  instructions: 'You are a helpful assistant that can use Composio tools.',
  model: 'gpt-4',
  tools: await composio.getTools()
});

// Create a thread
const thread = await openai.beta.threads.create();

// Create a run
const run = await openai.beta.threads.runs.create(thread.id, {
  assistant_id: assistant.id
});

// Wait for and handle tool calls
const finalRun = await composio.toolset.waitAndHandleAssistantToolCalls(
  openai,
  run,
  thread,
  'user-id'
);
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).