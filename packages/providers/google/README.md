# @composio/google

Google GenAI Provider for Composio SDK.

## Features

- **Google GenAI Integration**: Seamless integration with Google's Generative AI models (Gemini)
- **Function Calling Support**: Convert Composio tools to Google GenAI function declarations
- **Type Safety**: Full TypeScript support with proper type definitions
- **Execution Modifiers**: Support for transforming tool inputs and outputs
- **Flexible Authentication**: Support for custom authentication parameters
- **Streaming Support**: First-class support for streaming responses

## Installation

```bash
npm install @composio/core @composio/google @google/genai
# or
yarn add @composio/core @composio/google @google/genai
# or
pnpm add @composio/core @composio/google @google/genai
```

## Environment Variables

Required environment variables:

- `COMPOSIO_API_KEY`: Your Composio API key
- `GEMINI_API_KEY`: Your Google AI API key

Optional environment variables:

- `GOOGLE_PROJECT_ID`: Your Google Cloud project ID (for custom deployments)
- `GOOGLE_LOCATION`: Your Google Cloud location (for custom deployments)

## Quick Start

```typescript
import { Composio } from '@composio/core';
import { GoogleProvider } from '@composio/google';
import { GoogleGenerativeAI } from '@google/genai';

// Initialize Google GenAI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Initialize Composio with Google provider
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new GoogleProvider(),
});

// Get available tools
const tools = await composio.tools.get('user123', {
  toolkits: ['gmail', 'calendar'],
  limit: 10,
});
```

## Examples

Check out our complete example implementations:

- [Basic Google Integration](../../examples/google/src/index.ts)

## API Reference

### GoogleProvider Class

The `GoogleProvider` class extends `BaseNonAgenticProvider` and provides Google GenAI-specific functionality.

#### Methods

##### `wrapTool(tool: Tool): GoogleTool`

Wraps a Composio tool in the Google GenAI function declaration format.

```typescript
const wrappedTool = provider.wrapTool(composioTool);
```

##### `wrapTools(tools: Tool[]): GoogleGenAIToolCollection`

Wraps multiple Composio tools in the Google GenAI function declaration format.

```typescript
const wrappedTools = provider.wrapTools(composioTools);
```

##### `executeToolCall(userId: string, tool: GoogleGenAIFunctionCall, options?: ExecuteToolFnOptions, modifiers?: ExecuteToolModifiers): Promise<string>`

Executes a tool call from Google GenAI and returns the result as a JSON string.

```typescript
const result = await provider.executeToolCall('user123', functionCall, options, modifiers);
```

#### Types

```typescript
interface GoogleGenAIFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

type GoogleTool = {
  name: string;
  description: string;
  parameters: Schema;
};

type GoogleGenAIToolCollection = GoogleTool[];
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
