# Building Agents using Google Gemini with Composio

Build AI agents using Google's Gemini API with Composio tools.

## Installation

```bash
npm install @composio/core @composio/google @google/genai
```

```bash
pip install composio-google google-genai
```

**Find Latest Versions:**
```bash
npm view @google/genai version
pip index versions google-genai | grep "Available versions" | head -1
```

## Integration Method

**Google Gemini is a non-agentic provider** - uses direct tools (no Tool Router support).

### TypeScript Example

```typescript
import { Composio } from '@composio/core';
import { GoogleProvider } from '@composio/google';
import { GoogleGenAI } from '@google/genai';

const genai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new GoogleProvider(),
});

// Get tools
const tools = await composio.tools.get('default', { toolkits: ['github'] });

// Use with Gemini
const response = await genai.models.generateContent({
  model: 'gemini-3-flash-preview',
  contents: 'Create a GitHub issue',
  config: {
    tools: tools,
    temperature: 1.0  // Required for Gemini 3
  },
});

// Handle function calls
if (response.functionCalls) {
  const results = await composio.provider.handleToolCalls('default', response);
}
```

### Python Example

```python
from composio_google import ComposioToolSet, Action
from google import genai
from google.genai import types

client = genai.Client(api_key="YOUR_KEY")
composio_toolset = ComposioToolSet(api_key="YOUR_KEY")

# Get tools
tools = composio_toolset.get_tools(actions=[Action.GITHUB_CREATE_ISSUE])

# Use with Gemini
response = client.models.generate_content(
    model="gemini-3-flash-preview",
    contents="Create a GitHub issue",
    config=types.GenerateContentConfig(
        tools=tools,
        temperature=1.0
    )
)

# Handle function calls
tool_results = composio_toolset.handle_tool_calls(response)
```

## Key Features

- **Compositional Function Calling**: Chain multiple functions automatically
- **Parallel Execution**: Execute independent functions simultaneously
- **Internal Thinking**: Gemini 3 models reason through complex requests

## Key Resources

- **Gemini API Docs**: https://ai.google.dev/gemini-api/docs
- **Function Calling**: https://ai.google.dev/gemini-api/docs/function-calling
- **Available Models**: Gemini 3 Pro/Flash, Gemini 2.5 Pro/Flash

## Environment Variables

```bash
GOOGLE_API_KEY=...
COMPOSIO_API_KEY=...
```

## Next Steps

1. Check `ts/examples/google/` for complete examples
2. See [Gemini docs](https://ai.google.dev) for API features
3. Note: Temperature must be 1.0 for Gemini 3 models
