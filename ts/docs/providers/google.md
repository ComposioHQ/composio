# Google GenAI Provider

The Google GenAI Provider allows you to integrate Google's Generative AI models (Gemini) with Composio tools.

## Installation

```bash
# Using npm
npm install @composio/core @composio/google @google/genai

# Using yarn
yarn add @composio/core @composio/google @google/genai

# Using pnpm
pnpm add @composio/core @composio/google @google/genai
```

## Usage

```typescript
import { Composio } from '@composio/core';
import { GoogleProvider } from '@composio/google';
import { GoogleGenAI } from '@google/genai';

// Initialize Google GenAI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Initialize Composio with Google Provider
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
  console.log(`Calling tool ${response.functionCalls[0].name}`);
  const result = await provider.executeToolCall(
    'default',
    {
      name: response.functionCalls[0].name,
      args: response.functionCalls[0].args
    }
  );
  console.log(JSON.parse(result).data);
}
```

## Configuration Options

The Google GenAI provider supports various initialization options:

### Gemini Developer API (API Key)

```typescript
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});
```

### Vertex AI

```typescript
const ai = new GoogleGenAI({
  vertexai: {
    project: 'your-project-id',
    location: 'us-central1',
    apiVersion: 'v1',
  },
});
```

## Supported Models

- `gemini-2.0-flash-001` - Fast, efficient model for most use cases
- `gemini-2.0-pro-001` - Advanced model with enhanced capabilities
- `gemini-1.5-flash-001` - Legacy model for backward compatibility
- `gemini-1.5-pro-001` - Legacy model with advanced capabilities

## Function Calling

The provider automatically converts Composio tools to the Google GenAI function declaration format, making it easy to use function calling with Gemini models.

## Examples

See the [examples/google](../../examples/google) directory for complete examples of using the Google GenAI provider with Composio.
