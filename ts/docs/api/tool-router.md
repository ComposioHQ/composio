# Tool Router

The Tool Router provides a powerful way to create isolated MCP (Model Context Protocol) sessions for users with scoped access to toolkits and tools. It enables dynamic configuration of which tools are available within a session and manages authentication for multiple toolkits.

## Overview

Tool Router allows you to:

- Create isolated sessions with specific toolkit configurations
- Manage authentication flows for users across multiple toolkits
- Access tools via an MCP-compatible server URL
- Query toolkit connection states
- Integrate with multiple AI frameworks (Vercel AI SDK, LangChain, OpenAI Agents, Claude Agents SDK)

> **Note:** When using MCP clients to connect to Tool Router, you don't need to pass a provider to the Composio constructor. A provider is only required when using `session.tools()` to get framework-specific tool objects.

## Quick Start

### Using MCP (Recommended)

When using Tool Router with MCP clients, you don't need to pass a provider:

## Installation

```bash
# npm
npm install @composio/core@0.2.7-alpha.1

# pnpm
pnpm add @composio/core@0.2.7-alpha.1

# yarn
yarn add @composio/core@0.2.7-alpha.1
```

```typescript
import { Composio } from '@composio/core';

const composio = new Composio();

// Create a session for a user with access to Gmail tools
const session = await composio.create('user_123', { 
  toolkits: ['gmail'] 
});

// Use the MCP URL with any MCP-compatible client
console.log(session.mcp.url);
```

### Using Framework-Specific Tools

If you want to use `session.tools()` to get tools formatted for a specific AI framework, pass the appropriate provider:

```typescript
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';

const composio = new Composio({
  provider: new VercelProvider(),
});

// Create a session for a user with access to Gmail tools
const session = await composio.create('user_123', { 
  toolkits: ['gmail'] 
});

// Get the tools formatted for Vercel AI SDK
const tools = await session.tools();
```

## Creating Sessions

### Basic Session Creation

Use `composio.create()` to create a new Tool Router session:

```typescript
import { Composio } from '@composio/core';

const composio = new Composio();

// Create a session with Gmail access
const session = await composio.create('user_123', { 
  toolkits: ['gmail'] 
});

console.log('Session ID:', session.sessionId);
console.log('MCP URL:', session.mcp.url);
```

### Using an Existing Session

If you have an existing session ID, you can retrieve it using `composio.use()`:

```typescript
const session = await composio.use('existing_session_id');

// Access session properties
console.log(session.sessionId);
console.log(session.mcp.url);
```

## Configuration Options

The session creation accepts a configuration object with the following options:

### `toolkits`

Specify which toolkits to enable or disable in the session.

```typescript
// Simple array of toolkit slugs to enable
const session = await composio.create('user_123', {
  toolkits: ['gmail', 'slack', 'github']
});

// Explicit enabled configuration
const session = await composio.create('user_123', {
  toolkits: { enable: ['gmail', 'slack'] }
});

// Disable specific toolkits (enable all others)
const session = await composio.create('user_123', {
  toolkits: { disable: ['calendar'] }
});
```

### `tools`

Fine-grained control over which tools are available within toolkits. Configure tools per toolkit using the toolkit slug as the key.

```typescript
const session = await composio.create('user_123', {
  toolkits: ['gmail', 'slack'],
  tools: {
    // Configure tools per toolkit
    gmail: ['gmail_fetch_emails', 'gmail_send_email'], // Only these tools
    // OR use enable/disable objects
    // gmail: { enable: ['gmail_fetch_emails'] }
    // gmail: { disable: ['gmail_delete_email'] }
    
    // You can also set tags per toolkit to override global tags
    slack: { tags: ['readOnlyHint'] }
  }
});
```

### `tags`

Global tags to filter tools by their behavior hints. Tags can be overridden per toolkit in the `tools` configuration.

```typescript
const session = await composio.create('user_123', {
  toolkits: ['gmail', 'github'],
  // Global tags applied to all toolkits
  tags: ['readOnlyHint', 'idempotentHint']
});
```

Available tags:
- `readOnlyHint` - Tools that only read data
- `destructiveHint` - Tools that modify or delete data
- `idempotentHint` - Tools that can be safely retried

### `authConfigs`

Map toolkits to specific authentication configurations:

```typescript
const session = await composio.create('user_123', {
  toolkits: ['gmail', 'github'],
  authConfigs: {
    gmail: 'ac_gmail_work',
    github: 'ac_github_personal'
  }
});
```

### `connectedAccounts`

Map toolkits to specific connected account IDs:

```typescript
const session = await composio.create('user_123', {
  toolkits: ['gmail'],
  connectedAccounts: {
    gmail: 'ca_abc123'
  }
});
```

### `manageConnections`

Control how connections are managed within the session:

```typescript
// Boolean: enable/disable automatic connection management
const session = await composio.create('user_123', {
  toolkits: ['gmail'],
  manageConnections: true // default
});

// Object: fine-grained control
const session = await composio.create('user_123', {
  toolkits: ['gmail'],
  manageConnections: {
    enable: true,
    callbackUrl: 'https://your-app.com/auth/callback'
  }
});
```

### `workbench`

Configure workbench behavior for tool execution:

```typescript
const session = await composio.create('user_123', {
  toolkits: ['gmail'],
  workbench: {
    enableProxyExecution: true,
    autoOffloadThreshold: 400000 // Automatically offload to workbench if response > 400k characters
  }
});
```

## Session Properties

A Tool Router session provides the following properties and methods:

### `sessionId`

The unique identifier for this session.

```typescript
console.log(session.sessionId);
```

### `mcp`

The MCP server configuration for this session, including authentication headers.

```typescript
console.log(session.mcp.url);     // The URL to connect to
console.log(session.mcp.type);    // 'http' or 'sse'
console.log(session.mcp.headers); // Authentication headers (includes x-api-key if configured)
```

### `tools()`

Retrieve the tools available in the session, formatted for your AI framework.

```typescript
const tools = await session.tools();

// With modifiers
const tools = await session.tools({
  beforeExecute: ({ toolSlug, params }) => {
    console.log(`Executing ${toolSlug}`);
    return params;
  },
  afterExecute: ({ toolSlug, result }) => {
    console.log(`Completed ${toolSlug}`);
    return result;
  }
});
```

### `authorize()`

Initiate an authorization flow for a toolkit.

```typescript
// Start authorization for Gmail
const connectionRequest = await session.authorize('gmail');

console.log(connectionRequest.redirectUrl); // URL to redirect user for auth

// Wait for the user to complete authorization
const connectedAccount = await connectionRequest.waitForConnection();
console.log('Connected:', connectedAccount);
```

### `toolkits()`

Query the connection state of toolkits in the session.

```typescript
const { items, nextCursor, totalPages } = await session.toolkits();

for (const toolkit of items) {
  console.log(`${toolkit.name} (${toolkit.slug})`);
  console.log(`  Connected: ${toolkit.connection?.isActive}`);
  if (toolkit.connection?.connectedAccount) {
    console.log(`  Account ID: ${toolkit.connection.connectedAccount.id}`);
    console.log(`  Status: ${toolkit.connection.connectedAccount.status}`);
  }
}

// Pagination support
const moreToolkits = await session.toolkits({ 
  nextCursor: nextCursor,
  limit: 10 
});

// Filter by specific toolkits
const filteredToolkits = await session.toolkits({
  toolkits: ['gmail', 'slack']
});

// Combine filtering with pagination
const paginatedFilteredToolkits = await session.toolkits({
  toolkits: ['gmail', 'github'],
  limit: 5,
  nextCursor: 'cursor_abc'
});
```

## Framework Integrations

### Vercel AI SDK (with Provider)

When using the `session.tools()` method, you need to pass a provider to get framework-specific tools:

```typescript
import { openai } from '@ai-sdk/openai';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { stepCountIs, streamText } from 'ai';

const composio = new Composio({
  provider: new VercelProvider(),
});

const session = await composio.create('user_123', { 
  toolkits: ['gmail'] 
});

const tools = await session.tools();

const stream = await streamText({
  model: openai('gpt-4o-mini'),
  prompt: 'Find my last email from gmail?',
  stopWhen: stepCountIs(10),
  tools,
});

for await (const textPart of stream.textStream) {
  process.stdout.write(textPart);
}
```

### Vercel AI SDK (with MCP Client)

When using MCP clients, no provider is needed. The MCP client fetches tools directly from the MCP server URL:

```typescript
import { openai } from '@ai-sdk/openai';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { Composio } from '@composio/core';
import { stepCountIs, streamText } from 'ai';

// No provider needed when using MCP
const composio = new Composio();
const { mcp } = await composio.create('user_123', { 
  toolkits: ['gmail'], 
  manageConnections: true,
  tools: {
    gmail: {
      disable: ['gmail_send_email'], // Disable specific tools
    }
  }
});

// Create MCP client using the session URL and headers
const client = await createMCPClient({
  transport: {
    type: 'http',
    url: mcp.url,
    headers: mcp.headers // Uses pre-configured authentication headers
  }
});

const tools = await client.tools();

const stream = await streamText({
  model: openai('gpt-4o-mini'),
  prompt: 'Find my last email from gmail?',
  stopWhen: stepCountIs(10),
  onStepFinish: (step) => {
    if (step.toolCalls.length > 0) {
      for (const toolCall of step.toolCalls) {
        console.log(`Executed ${toolCall.toolName}`);
      }
    }
  },
  tools,
});

for await (const textPart of stream.textStream) {
  process.stdout.write(textPart);
}
```

### LangChain

LangChain can connect to Tool Router via MCP adapters. No provider is needed:

```typescript
import { MultiServerMCPClient } from "@langchain/mcp-adapters";  
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { Composio } from "@composio/core";

// No provider needed when using MCP
const composio = new Composio();

const llm = new ChatOpenAI({
  model: "gpt-4o",
});

const session = await composio.create('user_123', { 
  toolkits: ['gmail'] 
});

const client = new MultiServerMCPClient({  
  composio: {
    transport: "http",  
    url: session.mcp.url,
    headers: session.mcp.headers // Uses pre-configured authentication headers
  },
});

const tools = await client.getTools();  

const agent = createAgent({
  name: "Gmail Assistant",
  systemPrompt: "You are a helpful gmail assistant.",
  model: llm,
  tools,  
});

const result = await agent.invoke({
  messages: [{ role: "user", content: "Fetch my last email from gmail" }],
});

console.log(result);
```

### OpenAI Agents SDK

OpenAI Agents SDK supports hosted MCP tools. No provider is needed:

```typescript
import { Agent, run, hostedMcpTool } from '@openai/agents';
import { Composio } from '@composio/core';

// No provider needed when using MCP
const composio = new Composio();

const session = await composio.create('user_123', { 
  toolkits: ['gmail'] 
});

console.log(`Tool Router Session Created: ${session.sessionId}`);
console.log(`Connecting to MCP server: ${session.mcp.url}`);

const mcpTool = hostedMcpTool({
  serverLabel: 'ComposioApps',
  serverUrl: session.mcp.url,
  headers: session.mcp.headers // Uses pre-configured authentication headers
});

const agent = new Agent({
  name: 'Gmail Assistant',
  instructions: 'You are a helpful gmail assistant.',
  tools: [mcpTool],
});

const result = await run(agent, 'Summarize my last email from gmail', {
  stream: true,
});

const stream = result.toStream();

for await (const event of stream) {
  if (event.type === 'raw_model_stream_event' && event.data.delta) {
    process.stdout.write(event.data.delta);
  }
}
```

### Claude Agents SDK

Claude Agents SDK supports MCP servers natively. No provider is needed:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { Composio } from '@composio/core';

// No provider needed when using MCP
const composio = new Composio();

const session = await composio.create('user_123', { 
  toolkits: ['gmail'] 
});

const stream = await query({
  prompt: 'Use composio tools to fetch my last email from gmail',
  options: {
    model: 'claude-sonnet-4-5-20250929',
    permissionMode: "bypassPermissions",
    mcpServers: {
      composio: {
        type: 'http',
        url: session.mcp.url,
        headers: session.mcp.headers // Uses pre-configured authentication headers
      }
    },
  }
});

for await (const event of stream) {
  if (event.type === "result" && event.subtype === "success") {
    process.stdout.write(event.result);
  }
}
```

## Authorization Flow

When a user needs to connect a toolkit, use the `authorize()` method:

```typescript
import { Composio } from '@composio/core';

const composio = new Composio();
const session = await composio.create('user_123', { 
  toolkits: ['gmail'] 
});

// Initiate authorization for Gmail
const connectionRequest = await session.authorize("gmail");

// Log the redirect URL for the user
console.log('Redirect URL:', connectionRequest.redirectUrl);

// Wait for the user to complete the authorization
const connectedAccount = await connectionRequest.waitForConnection();
console.log('Connected Account:', connectedAccount);
```

You can also provide a custom callback URL:

```typescript
const connectionRequest = await session.authorize("gmail", {
  callbackUrl: 'https://your-app.com/auth/callback'
});
```

## Querying Toolkit States

Use the `toolkits()` method to check connection states:

```typescript
import { Composio } from '@composio/core';

const composio = new Composio();
const session = await composio.create('user_123');

// Get all toolkits
const toolkits = await session.toolkits(); 

console.log(JSON.stringify({ toolkits }, null, 2));

// Filter by specific toolkits
const gmailAndSlack = await session.toolkits({
  toolkits: ['gmail', 'slack']
});
```

The response includes:

```typescript
{
  items: [
    {
      slug: 'gmail',
      name: 'Gmail',
      logo: 'https://...',
      isNoAuth: false,
      connection: {
        isActive: true,
        authConfig: {
          id: 'ac_xxx',
          mode: 'OAUTH2',
          isComposioManaged: true
        },
        connectedAccount: {
          id: 'ca_xxx',
          status: 'ACTIVE'
        }
      }
    }
  ],
  nextCursor: 'cursor_abc',
  totalPages: 1
}
```

## Using Modifiers

Add custom behavior before and after tool execution:

```typescript
import { ExecuteToolModifiers } from "@composio/core";

const modifiers: ExecuteToolModifiers = {
  beforeExecute: ({ toolSlug, params }) => {
    console.log(`Executing ${toolSlug}`);
    return params;
  },
  afterExecute: ({ toolSlug, result }) => {
    console.log(`Executed ${toolSlug}`);
    return result;
  },
};

const tools = await session.tools(modifiers);
```

## Best Practices

1. **User Isolation**: Create separate sessions per user to ensure proper isolation of connections and tools.

2. **Toolkit Selection**: Only enable toolkits that are necessary for the use case to maintain security and reduce complexity.

3. **Connection Management**: Use `manageConnections: true` (default) for interactive applications where users can be prompted to connect accounts.

4. **Tag Filtering**: Use global `tags` to filter tools by their behavior (readOnlyHint, destructiveHint, idempotentHint) and override per toolkit when needed.

5. **Session Reuse**: Store and reuse `sessionId` to maintain user sessions across requests.

```typescript
// Store session ID after creation
const session = await composio.create('user_123', config);
await redis.set(`session:user_123`, session.sessionId);

// Retrieve existing session
const sessionId = await redis.get(`session:user_123`);
if (sessionId) {
  const session = await composio.use(sessionId);
}
```

## Type Reference

### ToolRouterCreateSessionConfig

```typescript
interface ToolRouterCreateSessionConfig {
  toolkits?: string[] | { enable: string[] } | { disable: string[] };
  tools?: Record<string, 
    string[] | 
    { enable: string[] } | 
    { disable: string[] } | 
    { tags: ('readOnlyHint' | 'destructiveHint' | 'idempotentHint')[] }
  >;
  tags?: ('readOnlyHint' | 'destructiveHint' | 'idempotentHint')[];
  authConfigs?: Record<string, string>;
  connectedAccounts?: Record<string, string>;
  manageConnections?: boolean | {
    enable?: boolean;
    callbackUrl?: string;
  };
  workbench?: {
    enableProxyExecution?: boolean;
    autoOffloadThreshold?: number;
  };
}
```

### ToolRouterSession

```typescript
interface ToolRouterSession {
  sessionId: string;
  mcp: {
    type: 'http' | 'sse';
    url: string;
    headers?: Record<string, string>; // Authentication headers (includes x-api-key if configured)
  };
  tools: (modifiers?: ProviderOptions) => Promise<Tools>;
  authorize: (toolkit: string, options?: { callbackUrl?: string }) => Promise<ConnectionRequest>;
  toolkits: (options?: { 
    toolkits?: string[];   // Filter by specific toolkit slugs
    nextCursor?: string;   // Pagination cursor
    limit?: number;        // Number of items per page
  }) => Promise<ToolkitConnectionsDetails>;
}
```

### ToolkitConnectionState

```typescript
interface ToolkitConnectionState {
  slug: string;
  name: string;
  logo?: string;
  isNoAuth: boolean;
  connection: {
    isActive: boolean;
    authConfig?: {
      id: string;
      mode: string;
      isComposioManaged: boolean;
    };
    connectedAccount?: {
      id: string;
      status: string;
    };
  };
}
```

