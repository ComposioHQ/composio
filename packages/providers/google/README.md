# @composio/google

Google GenAI Provider for Composio SDK.

## Features

- **Google GenAI Integration**: Seamless integration with Google's Generative AI models (Gemini)
- **Function Calling Support**: Convert Composio tools to Google GenAI function declarations
- **Multiple Authentication Methods**: Support for both API key and Vertex AI authentication
- **Type Safety**: Full TypeScript support with proper type definitions

## Installation

```bash
npm install @composio/google @google/genai
# or
yarn add @composio/google @google/genai
# or
pnpm add @composio/google @google/genai
```

## Quick Start

```typescript
import { Composio } from '@composio/core';
import { GoogleProvider } from '@composio/google';
import { GoogleGenAI } from '@google/genai';

// Initialize Google GenAI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Initialize Composio with Google provider
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new GoogleProvider(),
});

// Get available tools
const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER');
```

## Usage Examples

### Function Calling Example

```typescript
import { Composio } from '@composio/core';
import { GoogleProvider } from '@composio/google';
import { GoogleGenAI } from '@google/genai';

// Initialize Google GenAI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Initialize Composio
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new GoogleProvider(),
});

// Get tools
const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER');

// Define task
const task = "Fetch the details of the user 'haxzie'";

// Generate content with function calling
const response = await ai.models.generateContent({
  model: 'gemini-2.0-flash-001',
  contents: task,
  config: {
    tools: [{ functionDeclarations: tools }],
  },
});

// Handle function calls
if (response.functionCalls) {
  const result = await composio.tools.execute(response.functionCalls[0].name, {
    userId: 'default',
    arguments: response.functionCalls[0].args,
  });
  console.log(result.data);
}
```

## API Reference

### GoogleProvider Class

The `GoogleProvider` class extends `BaseNonAgenticProvider` and provides Google GenAI-specific functionality.

#### Methods

##### `wrapTool(tool: Tool): GoogleGenAIFunctionDeclaration`

Wraps a Composio tool in the Google GenAI function declaration format.

```typescript
const wrappedTool = provider.wrapTool(composioTool);
```

##### `wrapTools(tools: Tool[]): GoogleGenAIToolCollection`

Wraps a list of Composio tools in the Google GenAI function declaration format.

```typescript
const wrappedTools = provider.wrapTools(composioTools);
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
