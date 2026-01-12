# @composio/livekit

Composio provider for the [LiveKit Agents SDK](https://docs.livekit.io/agents/) (`@livekit/agents`).

This provider enables seamless integration of Composio tools with LiveKit Agents, allowing you to use any Composio-supported tool (Gmail, Slack, GitHub, etc.) within your LiveKit voice AI agents.

## Installation

```bash
npm install @composio/livekit @composio/core @livekit/agents
```

### Prerequisites

1. **LiveKit Cloud Account**: Sign up at [livekit.io](https://livekit.io) and create a project
2. **LiveKit CLI**: Install the LiveKit CLI for local development:

   ```bash
   # macOS
   brew install livekit-cli

   # or via npm
   npm install -g livekit-cli
   ```

3. **Environment Variables**:

   - `LIVEKIT_API_KEY`: Your LiveKit API key
   - `LIVEKIT_API_SECRET`: Your LiveKit API secret
   - `LIVEKIT_URL`: Your LiveKit server URL
   - `COMPOSIO_API_KEY`: Your Composio API key from [app.composio.dev](https://app.composio.dev)

   You can load LiveKit credentials using:

   ```bash
   lk app env -w -d .env
   ```

## Usage

```typescript
import { Composio } from '@composio/core';
import { LivekitProvider } from '@composio/livekit';
import {
  type JobContext,
  type JobProcess,
  WorkerOptions,
  cli,
  defineAgent,
  voice,
} from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

// Initialize Composio with the LiveKit provider
const provider = new LivekitProvider();
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider,
});

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    // Get Composio tools wrapped for LiveKit
    const tools = await composio.tools.get('default', ['GMAIL_FETCH_EMAILS', 'SLACK_POST_MESSAGE']);

    // Create a voice agent with Composio tools
    const agent = new voice.Agent({
      instructions: `You are a helpful voice AI assistant with access to email and messaging tools.
        You can fetch emails from Gmail and post messages to Slack.
        Be concise and helpful in your responses.`,
      tools,
    });

    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      stt: 'assemblyai/universal-streaming:en',
      llm: 'openai/gpt-4.1-mini',
      tts: 'cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
    });

    await session.start({
      agent,
      room: ctx.room,
    });

    await ctx.connect();

    session.generateReply({
      instructions: 'Greet the user and offer your assistance.',
    });
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
```

## API Reference

### `LivekitProvider`

The main provider class for integrating Composio tools with LiveKit Agents.

#### Properties

- `name`: `'livekit'` - The provider name

#### Methods

##### `wrapTool(tool, executeTool)`

Wraps a single Composio tool as a LiveKit Agent LLM tool.

```typescript
const livekitTool = provider.wrapTool(composioTool, executeFn);
```

##### `wrapTools(tools, executeTool)`

Wraps multiple Composio tools as LiveKit Agent LLM tools. Returns a record with camelCase keys.

```typescript
const tools = await composio.tools.get('default', ['GMAIL_SEND_EMAIL', 'SLACK_POST_MESSAGE']);
// Returns: { gmailSendEmail: LivekitTool, slackPostMessage: LivekitTool }
```

## How It Works

The LiveKit Agents SDK uses `llm.tool()` to define tools that can be called by the LLM during a voice conversation. This provider:

1. Converts Composio tool definitions (JSON Schema) to Zod schemas using `@composio/json-schema-to-zod`
2. Creates LiveKit-compatible tool definitions using `llm.tool()`
3. Handles tool execution by routing calls through Composio's execution layer
4. Converts tool slugs from `SCREAMING_SNAKE_CASE` to `camelCase` for LiveKit compatibility

## Examples

### Voice Agent with Weather and Email Tools

```typescript
import { Composio } from '@composio/core';
import { LivekitProvider } from '@composio/livekit';
import { voice, llm } from '@livekit/agents';
import { z } from 'zod';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new LivekitProvider(),
});

// Get Composio tools
const composioTools = await composio.tools.get('default', ['GMAIL_FETCH_EMAILS']);

// Combine with custom tools
const customTools = {
  getWeather: llm.tool({
    description: 'Get weather for a location',
    parameters: z.object({
      location: z.string().describe('City name'),
    }),
    execute: async ({ location }) => {
      return `Weather in ${location}: Sunny, 72°F`;
    },
  }),
};

const agent = new voice.Agent({
  instructions: 'You are a helpful assistant.',
  tools: { ...composioTools, ...customTools },
});
```

### Using with Realtime Models

```typescript
import * as openai from '@livekit/agents-plugin-openai';

const session = new voice.AgentSession({
  llm: new openai.realtime.RealtimeModel({ voice: 'coral' }),
});
```

## Tool Naming Convention

Composio tool slugs are automatically converted from `SCREAMING_SNAKE_CASE` to `camelCase`:

| Composio Slug         | LiveKit Tool Name   |
| --------------------- | ------------------- |
| `GMAIL_SEND_EMAIL`    | `gmailSendEmail`    |
| `SLACK_POST_MESSAGE`  | `slackPostMessage`  |
| `GITHUB_CREATE_ISSUE` | `githubCreateIssue` |

## Running Your Agent

```bash
# Development mode with auto-reload
npx tsx watch src/agent.ts dev

# Connect to playground for testing
# Visit https://agents-playground.livekit.io

# Production mode
npx tsx src/agent.ts start
```

## License

ISC
