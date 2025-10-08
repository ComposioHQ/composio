# @composio/llamaindex

Agentic Provider for Llamaindex in Composio SDK.

## Features

- **Seamless LlamaIndex Integration**: Tools are automatically compatible with LlamaIndex agents and workflows
- **Full Modifier Support**: Support for both schema and execution modifiers with beforeExecute/afterExecute hooks
- **Streaming Support**: Works with LlamaIndex streaming agents using `agentStreamEvent`
- **Tool Execution**: Execute tools with proper parameter handling and JSON schema validation
- **Type Safety**: Full TypeScript support with proper type definitions
- **Zod Schema Integration**: Automatic conversion from JSON Schema to Zod for LlamaIndex compatibility

## Installation

```bash
npm install @composio/llamaindex
# or
yarn add @composio/llamaindex
# or
pnpm add @composio/llamaindex
```

## Quick Start

```typescript
import { Composio } from '@composio/core';
import { LlamaindexProvider } from '@composio/llamaindex';

// Initialize Composio with Llamaindex provider
const composio = new Composio({
  apiKey: 'your-composio-api-key',
  provider: new LlamaindexProvider(),
});

// Get available tools
const tools = await composio.tools.get('user123', {
  toolkits: ['gmail', 'googlecalendar'],
  limit: 10,
});
```

## Prerequisites

Before using the LlamaIndex provider, make sure you have:

1. **Composio API Key**: Get your API key from [Composio Dashboard](https://app.composio.dev)
2. **Environment Setup**: Set up your environment variables
3. **LlamaIndex Dependencies**: Install required LlamaIndex packages

```bash
# Install LlamaIndex dependencies
npm install @llamaindex/openai @llamaindex/workflow
```

```bash
# Set up environment variables
export COMPOSIO_API_KEY="your-composio-api-key"
export OPENAI_API_KEY="your-openai-api-key"  # For LlamaIndex OpenAI integration
```

## Usage Examples

### Basic Example

```typescript
import { Composio } from '@composio/core';
import { LlamaindexProvider } from '@composio/llamaindex';

// Initialize Composio
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new LlamaindexProvider(),
});

// Get tools
const tools = await composio.tools.get('default', {
  toolkits: ['gmail'],
  limit: 10,
});

console.log(`Found ${tools.length} tools`);
```

### Complete Agent Example with HackerNews

```typescript
import { Composio } from '@composio/core';
import { LlamaindexProvider } from '@composio/llamaindex';
import { openai } from '@llamaindex/openai';
import { agent, agentStreamEvent } from '@llamaindex/workflow';
import 'dotenv/config';

// Initialize Composio with LlamaIndex provider
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new LlamaindexProvider(),
});

async function main() {
  try {
    console.log('🚀 Starting LlamaIndex Example...');

    // Get available tools with modifiers
    const tools = await composio.tools.get(
      'default',
      {
        toolkits: ['hackernews'],
        limit: 10,
      },
      {
        beforeExecute: ({ toolSlug, toolkitSlug, params }) => {
          console.log(`🔄 Executing tool ${toolSlug}/${toolkitSlug} with params:`, { params });
          return params;
        },
        afterExecute: ({ toolSlug, toolkitSlug, result }) => {
          console.log(`✅ Executed tool ${toolSlug}/${toolkitSlug} with result:`, { result });
          return result;
        },
      }
    );

    console.log(`✅ Found ${tools.length} tools`);

    // Create LlamaIndex agent with Composio tools
    const hackernewsAgent = agent({
      name: 'Hackernews Agent',
      description: 'A helpful hackernews assistant',
      llm: openai({ model: 'gpt-4o-mini' }),
      systemPrompt:
        'You are a helpful hackernews assistant that helps users with their queries related to hackernews',
      tools, // Composio tools are automatically compatible with LlamaIndex
    });

    // Run the agent with streaming
    const stream = await hackernewsAgent.runStream('Summarize the front page of hackernews');

    for await (const event of stream) {
      if (agentStreamEvent.include(event)) {
        process.stdout.write(event.data.delta);
      }
    }
  } catch (error) {
    console.error('❌ Error running example:', error);
  }
}

main().catch(console.error);
```

### Using Tools with Different Toolkits

```typescript
import { Composio } from '@composio/core';
import { LlamaindexProvider } from '@composio/llamaindex';
import { openai } from '@llamaindex/openai';
import { agent } from '@llamaindex/workflow';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new LlamaindexProvider(),
});

// Get tools from multiple toolkits
const tools = await composio.tools.get('default', {
  toolkits: ['gmail', 'googlecalendar', 'slack'],
  limit: 20,
});

// Create a multi-purpose agent
const assistantAgent = agent({
  name: 'Personal Assistant',
  description: 'A helpful personal assistant',
  llm: openai({ model: 'gpt-4' }),
  systemPrompt:
    'You are a helpful personal assistant that can manage emails, calendar events, and slack messages.',
  tools,
});

// Use the agent
const response = await assistantAgent.run(
  'Schedule a meeting for tomorrow at 2 PM and send a slack message about it'
);
console.log(response);
```

## API Reference

### LlamaindexProvider Class

The `LlamaindexProvider` class extends `BaseAgenticProvider` and provides llamaindex-specific functionality.

#### Methods

##### `wrapTool(tool: Tool, executeTool: ExecuteToolFn): LlamaindexTool`

Wraps a single Composio tool in the LlamaIndex format with proper Zod schema conversion.

```typescript
const llamaindexTool = provider.wrapTool(composioTool, executeTool);

// The wrapped tool has LlamaIndex-compatible structure:
// - metadata.name: Tool slug
// - metadata.description: Tool description
// - metadata.parameters: Zod schema for parameters
// - call(): Function to execute the tool
```

##### `wrapTools(tools: Tool[], executeTool: ExecuteToolFn): LlamaindexTool[]`

Wraps multiple Composio tools for use with LlamaIndex agents.

```typescript
const llamaindexTools = provider.wrapTools(composioTools, executeTool);

// Use directly with LlamaIndex agents
const agent = agent({
  name: 'My Agent',
  llm: openai({ model: 'gpt-4' }),
  tools: llamaindexTools, // Ready to use!
});
```

##### `wrapMcpServerResponse(data: McpUrlResponse): McpServerGetResponse`

Transforms MCP URL responses into the standard format with URL objects.

```typescript
const mcpServers = provider.wrapMcpServerResponse(urlResponse);
// Returns: [{ url: URL, name: string }, ...]
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
