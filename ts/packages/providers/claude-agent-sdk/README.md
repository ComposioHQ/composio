# @composio/claude-code-agents

Composio provider for the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) (`@anthropic-ai/claude-agent-sdk`).

This provider enables seamless integration of Composio tools with Claude Code Agents, allowing you to use any Composio-supported tool (Gmail, Slack, GitHub, etc.) within your Claude agents.

## Installation

```bash
npm install @composio/claude-agent-sdk @composio/core @anthropic-ai/claude-agent-sdk
```

### Prerequisites

1. **Claude Code CLI**: The Claude Agent SDK requires Claude Code to be installed:

   ```bash
   # macOS/Linux/WSL
   curl -fsSL https://claude.ai/install.sh | bash

   # or via Homebrew
   brew install --cask claude-code

   # or via npm
   npm install -g @anthropic-ai/claude-code
   ```

2. **API Keys**:
   - `ANTHROPIC_API_KEY`: Your Anthropic API key from [console.anthropic.com](https://console.anthropic.com)
   - `COMPOSIO_API_KEY`: Your Composio API key from [app.composio.dev](https://app.composio.dev)

## Usage

```typescript
import { Composio } from '@composio/core';
import { ClaudeCodeAgentsProvider } from '@composio/claude-code-agents';
import { query, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';

// Initialize Composio
const composio = new Composio({
  provider: new ClaudeCodeAgentsProvider(),
});

// Create a tool router session
const session = await composio.create('external_user_id');

// Get tools from the session (native)
const tools = await session.tools();
const customServer = createSdkMcpServer({
  name: 'composio',
  version: '1.0.0',
  tools: tools,
});

// Initialize Claude client
for await (const content of query({
  prompt: 'Fetch my last email from gmail',
  options: {
    mcpServers: { composio: customServer },
    permissionMode: 'bypassPermissions',
  },
})) {
  if (content.type === 'assistant') {
    console.log('Claude:', content.message);
  }
}

console.log(`✅ Received response from Claude`);
```

## API Reference

### `ClaudeCodeAgentsProvider`

The main provider class for integrating Composio tools with Claude Code Agents.

#### Constructor Options

```typescript
interface ClaudeAgentSDKProviderOptions {
  serverName?: string; // Name for the MCP server (default: 'composio')
  serverVersion?: string; // Version for the MCP server (default: '1.0.0')
}
```

#### Methods

##### `wrapTool(tool, executeTool)`

Wraps a single Composio tool as a Claude Agent SDK MCP tool.

##### `wrapTools(tools, executeTool)`

Wraps multiple Composio tools as Claude Agent SDK MCP tools.

## How It Works

The Claude Agent SDK uses MCP (Model Context Protocol) servers to provide tools to Claude agents. This provider:

1. Converts Composio tool definitions to MCP tool format
2. Creates an in-process MCP server using `createSdkMcpServer()`
3. Handles tool execution by routing calls through Composio's execution layer

## Examples

### Using Multiple Tools

```typescript
const tools = await composio.tools.get('default', [
  'GMAIL_SEND_EMAIL',
  'GMAIL_LIST_EMAILS',
  'SLACK_POST_MESSAGE',
]);

const mcpServer = composio.provider.createMcpServer(tools, composio.tools.execute);

for await (const message of query({
  prompt: 'Check my latest emails and post a summary to #general on Slack',
  options: {
    mcpServers: { composio: mcpServer },
  },
})) {
  console.log(message);
}
```

### Custom Server Name

```typescript
const provider = new ClaudeCodeAgentsProvider({
  serverName: 'my-composio-tools',
  serverVersion: '2.0.0',
});
```

## License

ISC
