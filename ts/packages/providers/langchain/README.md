# @composio/langchain

The LangChain provider for Composio SDK, providing seamless integration with LangChain's ecosystem and tools.

## Features

- **LangChain Integration**: Seamless integration with LangChain's ecosystem
- **LCEL Support**: Full support for LangChain Expression Language (LCEL)
- **Streaming Support**: First-class support for streaming responses
- **Tool Execution**: Execute LangChain tools with proper parameter handling
- **Chain Integration**: Work with LangChain chains and agents
- **Type Safety**: Full TypeScript support with proper type definitions

## Installation

```bash
npm install @composio/core @composio/langchain @langchain/core @langchain/openai
# or
yarn add @composio/core @composio/langchain @langchain/core @langchain/openai
# or
pnpm add @composio/core @composio/langchain @langchain/core @langchain/openai
```

## Environment Variables

Required environment variables:

- `COMPOSIO_API_KEY`: Your Composio API key
- `OPENAI_API_KEY`: Your OpenAI API key (or other LLM provider's key)

Optional environment variables:

- `LANGCHAIN_TRACING_V2`: Enable LangChain tracing (set to "true")
- `LANGCHAIN_ENDPOINT`: Custom LangChain API endpoint
- `LANGCHAIN_API_KEY`: Your LangChain API key (for hosted services)

## Quick Start

```typescript
import { Composio } from '@composio/core';
import { LangChainProvider } from '@composio/langchain';

// Initialize Composio with LangChain provider
const composio = new Composio({
  apiKey: 'your-composio-api-key',
  provider: new LangChainProvider(),
});

// Get available tools
const tools = await composio.tools.get('user123', {
  toolkits: ['gmail', 'googlecalendar'],
  limit: 10,
});

// Get a specific tool
const sendEmailTool = await composio.tools.get('user123', 'GMAIL_SEND_EMAIL');
```

## Examples

Check out our complete example implementations:

- [Basic LangChain Integration](../../examples/langchain/src/index.ts)
- [LCEL Example](../../examples/langchain/src/lcel.ts)
- [RAG Example](../../examples/langchain/src/rag.ts)
- [Streaming Example](../../examples/langchain/src/streaming.ts)

### Basic Chain with Streaming

```typescript
import { Composio } from '@composio/core';
import { LangChainProvider } from '@composio/langchain';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOpenAI } from '@langchain/openai';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new LangChainProvider(),
});

// Get tools for the chain
const tools = await composio.tools.get('user123', {
  toolkits: ['gmail'],
  limit: 10,
});

const model = new ChatOpenAI({
  modelName: 'gpt-4',
  streaming: true,
});

const prompt = ChatPromptTemplate.fromTemplate('Tell me a joke about {topic}');
const parser = new StringOutputParser();

const chain = prompt.pipe(model).pipe(parser);

// Stream the response
const stream = await chain.stream({
  topic: 'programming',
});

for await (const chunk of stream) {
  console.log(chunk);
}
```

### Tool Execution with Streaming Events

```typescript
import { Composio } from '@composio/core';
import { LangChainProvider } from '@composio/langchain';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { ChatOpenAI } from '@langchain/openai';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new LangChainProvider(),
});

// Get tools for the chain
const tools = await composio.tools.get('user123', {
  toolkits: ['gmail'],
});

const model = new ChatOpenAI({
  modelName: 'gpt-4',
  streaming: true,
});

const chain = model.pipe(new JsonOutputParser());
const eventStream = await chain.streamEvents(
  `Output a list of the countries france, spain and japan and their populations in JSON format.`,
  { version: 'v2' }
);

for await (const event of eventStream) {
  const eventType = event.event;
  if (eventType === 'on_chat_model_stream') {
    console.log(`Chat model chunk: ${event.data.chunk.content}`);
  } else if (eventType === 'on_parser_stream') {
    console.log(`Parser chunk: ${JSON.stringify(event.data.chunk)}`);
  }
}
```

## Provider Configuration

The LangChain provider can be configured with various options:

```typescript
const provider = new LangChainProvider({
  // Default model configuration
  model: new ChatOpenAI({
    modelName: 'gpt-4',
    streaming: true,
  }),
  // Custom execution modifiers
  modifiers: {
    beforeExecute: params => {
      // Transform parameters before execution
      return params;
    },
    afterExecute: response => {
      // Transform response after execution
      return response;
    },
  },
  // Enable tracing
  tracing: true,
});
```

## API Reference

### LangChainProvider Class

The `LangChainProvider` class extends `BaseComposioProvider` and provides LangChain-specific functionality.

#### Methods

##### `executeToolCall(tool: Tool): Promise<string>`

Executes a LangChain tool call and returns the result.

```typescript
const result = await provider.executeToolCall(tool);
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
