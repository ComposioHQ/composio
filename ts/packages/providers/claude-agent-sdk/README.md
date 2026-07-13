# @composio/claude-agent-sdk

Composio provider for the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) (`@anthropic-ai/claude-agent-sdk`). It wraps Composio tools as in-process MCP tools that Claude agents can call.

## Installation

```bash
npm install @composio/core @composio/claude-agent-sdk @anthropic-ai/claude-agent-sdk
```

Set two environment variables:

- `COMPOSIO_API_KEY` from the [Composio dashboard](https://dashboard.composio.dev/settings)
- `ANTHROPIC_API_KEY` from [Anthropic](https://console.anthropic.com/settings/keys)

## Quickstart

Create a session for your user, serve its tools through an SDK MCP server, and query Claude:

```typescript
import { Composio } from '@composio/core';
import { ClaudeAgentSDKProvider } from '@composio/claude-agent-sdk';
import { createSdkMcpServer, query } from '@anthropic-ai/claude-agent-sdk';

const composio = new Composio({ provider: new ClaudeAgentSDKProvider() });

// Each session is scoped to one of your users
const session = await composio.sessions.create('user_123');
const tools = await session.tools();

const customServer = createSdkMcpServer({
  name: 'composio',
  version: '1.0.0',
  tools,
});

for await (const stream of query({
  prompt: 'Summarize my emails from today',
  options: {
    mcpServers: { composio: customServer },
    permissionMode: 'bypassPermissions',
  },
})) {
  if (stream.type === 'assistant') {
    for (const block of stream.message.content) {
      if (block.type === 'text') process.stdout.write(block.text);
    }
  }
}
```

For multi-turn conversations, store `session.sessionId` and reuse it with `composio.sessions.use(sessionId)` instead of creating a new session each turn.

## How it works

The Claude Agent SDK provides tools to agents through MCP (Model Context Protocol) servers. `ClaudeAgentSDKProvider` converts each Composio tool definition into an MCP tool and routes execution back through Composio, so `createSdkMcpServer` can serve them in process; no separate server to run.

## Links

- [Composio quickstart](https://docs.composio.dev/docs/quickstart)
- [Composio documentation](https://docs.composio.dev)
- [Claude Agent SDK documentation](https://platform.claude.com/docs/en/agent-sdk/overview)
