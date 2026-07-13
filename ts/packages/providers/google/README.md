# @composio/google

Adapts Composio tools to Gemini function declarations for the Google GenAI SDK (`@google/genai`) and executes the function calls the model returns.

## Installation

```bash
npm install @composio/core @composio/google @google/genai
```

Set `COMPOSIO_API_KEY` (create one at https://dashboard.composio.dev/settings) and `GOOGLE_API_KEY` (from https://aistudio.google.com/apikey) in your environment.

## Quickstart

Create a session for your user, pass its tools to Gemini as function declarations, and run the loop: execute each function call with `composio.provider.executeToolCall`, feed the result back, and repeat until the model replies with text.

```typescript
import { Composio } from '@composio/core';
import { GoogleProvider } from '@composio/google';
import { GoogleGenAI, type Part } from '@google/genai';

const composio = new Composio({
  provider: new GoogleProvider(),
});
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });

// Create a session for your user
const session = await composio.sessions.create('user_123');
const tools = await session.tools();

const chat = ai.chats.create({
  model: 'gemini-3-pro-preview',
  config: {
    tools: [{ functionDeclarations: tools }],
  },
});

let response = await chat.sendMessage({
  message:
    "Send an email to john@example.com with the subject 'Hello' and body 'Hello from Composio!'",
});

// Agentic loop: keep executing tool calls until the model responds with text
while (response.functionCalls && response.functionCalls.length > 0) {
  const parts: Part[] = [];
  for (const fc of response.functionCalls) {
    const result = await composio.provider.executeToolCall('user_123', {
      name: fc.name || '',
      args: (fc.args || {}) as Record<string, unknown>,
    });
    parts.push({
      functionResponse: {
        id: fc.id,
        name: fc.name,
        response: JSON.parse(result),
      },
    });
  }
  response = await chat.sendMessage({ message: parts });
}

console.log(response.text);
```

## Tool execution

Gemini function calling is non-agentic; the model returns function calls and you execute them. `GoogleProvider` exposes `executeToolCall(userId, functionCall, options?, modifiers?)`, which takes a `{ name, args }` pair and returns the tool result as a JSON string. The constructor takes no options.

## Links

- [Google provider docs](https://docs.composio.dev/docs/providers/google)
- [Composio documentation](https://docs.composio.dev)
