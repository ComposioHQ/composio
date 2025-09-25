# Experimental MCP (Model Control Protocol) API

The experimental MCP API provides enhanced Model Control Protocol capabilities with provider-specific optimizations and simplified configuration management. This experimental implementation builds on top of the standard MCP API, offering streamlined workflows for different AI frameworks and providers.

## Overview

The experimental MCP API introduces two key components:

1. **`experimental.mcp`** - Enhanced MCP server operations with provider-specific response formatting
2. **`experimental.mcpConfig`** - Simplified MCP configuration management

Key benefits of the experimental API:
- **Provider-specific optimizations**: Automatic response formatting for different AI frameworks
- **Simplified configuration**: Streamlined server creation and management
- **Enhanced type safety**: Better TypeScript support with provider-specific return types
- **Framework integration**: Direct compatibility with popular AI frameworks like Anthropic, OpenAI, Vercel AI, Google Gemini, and Mastra

## Getting Started

### Enabling Experimental MCP

The experimental MCP features are available by default. Simply initialize Composio with your chosen provider:

```typescript
import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new AnthropicProvider(),
});
```

### Basic Usage Pattern

```typescript
// 1. Create MCP configuration
const mcpConfig = await composio.experimental.mcpConfig.create(
  "my-server-name",
  [
    {
      authConfigId: "ac_your_auth_config",
      allowedTools: ["GMAIL_FETCH_EMAILS", "SLACK_SEND_MESSAGE"]
    }
  ],
  { isChatAuth: true }
);

// 2. Get server URLs for a user
const servers = await composio.experimental.mcp.getServer(
  "user123",
  mcpConfig.id,
  { limitTools: ["GMAIL_FETCH_EMAILS"] }
);

// 3. Use with your AI framework (provider-specific format)
// servers is automatically formatted for your chosen provider
```

## API Reference

### experimental.mcpConfig

The `mcpConfig` class provides simplified MCP server configuration management.

#### create(name, serverConfig, options)

Creates a new MCP server configuration with the specified toolkit settings.

```typescript
const mcpConfig = await composio.experimental.mcpConfig.create(
  "gmail-assistant",
  [
    {
      authConfigId: "ac_gmail_config",
      allowedTools: ["GMAIL_FETCH_EMAILS", "GMAIL_SEND_EMAIL"]
    },
    {
      authConfigId: "ac_slack_config", 
      allowedTools: ["SLACK_SEND_MESSAGE"]
    }
  ],
  { 
    isChatAuth: true  // Use Composio-managed authentication
  }
);
```

**Parameters:**

- `name` (string): Unique name for the MCP server configuration
- `serverConfig` (Array): Array of authentication and tool configurations
  - `authConfigId`: The authentication configuration ID to use
  - `allowedTools`: Array of specific tool IDs to expose through this configuration
- `options` (object): Configuration options
  - `isChatAuth` (boolean, optional): Whether to use Composio-managed authentication

**Returns:** `Promise<McpServerCreateResponse>` - Created server details including:
- `id`: Server configuration UUID
- `name`: Server name
- `toolkits`: Array of toolkit names
- `getServer`: Convenience method to get server URLs

#### getByName(configName)

Retrieves an existing MCP configuration by its name.

```typescript
const existingConfig = await composio.experimental.mcpConfig.getByName('gmail-assistant');
```

**Parameters:**
- `configName` (string): Name of the MCP configuration to retrieve

**Returns:** `Promise<McpRetrieveResponse>` - Configuration details

### experimental.mcp

The experimental MCP class provides enhanced server operations with provider-specific response formatting.

#### getServer(userId, mcpConfigurationId, options?)

Retrieves MCP server URLs formatted specifically for your chosen provider.

```typescript
// Returns provider-specific format
const servers = await composio.experimental.mcp.getServer(
  "user123",
  "mcp_config_uuid",
  {
    limitTools: ["GMAIL_FETCH_EMAILS"],
    isChatAuth: true
  }
);
```

**Parameters:**

- `userId` (string): ID of the user to generate server URLs for
- `mcpConfigurationId` (string): UUID of the MCP configuration
- `options` (object, optional): Additional server options
  - `limitTools` (string[]): Subset of tools to expose (from the configuration)
  - `isChatAuth` (boolean): Override authentication method

**Returns:** Provider-specific response format (see [Provider Integration](#provider-integration))

#### getRawMCPServer(userId, mcpConfigurationId, options?)

Returns the raw MCP server response without provider-specific formatting.

```typescript
const rawServer = await composio.experimental.mcp.getRawMCPServer(
  "user123", 
  "mcp_config_uuid"
);
```

**Parameters:** Same as `getServer()`

**Returns:** Raw MCP server response

## Provider Integration

The experimental MCP API automatically formats responses based on your chosen provider:

### Anthropic Provider

Returns an array of server configurations compatible with Anthropic's MCP client:

```typescript
import { AnthropicProvider } from '@composio/anthropic';

const composio = new Composio({
  provider: new AnthropicProvider(),
});

const servers = await composio.experimental.mcp.getServer(userId, configId);
// Returns: McpServerUrlInfo[]
// [
//   {
//     url: new URL("https://mcp.composio.dev/..."),
//     name: "gmail-assistant-user123",
//     toolkit: "gmail"
//   }
// ]

// Use with Anthropic Claude
const stream = anthropic.beta.messages.stream({
  model: 'claude-4-sonnet-20250514',
  mcp_servers: servers,
  messages: [...],
  betas: ['mcp-client-2025-04-04'],
});
```

### Google Gemini Provider

Returns a URL string for use with Google's MCP integration:

```typescript
import { GoogleProvider } from '@composio/google';
import { GoogleGenAI, mcpToTool } from '@google/genai';

const composio = new Composio({
  provider: new GoogleProvider(),
});

const url = await composio.experimental.mcp.getServer(userId, configId);
// Returns: string (URL)

// Create MCP client and tools
const serverParams = new SSEClientTransport(url);
const mcpClient = new MCPClient({
  name: 'composio-mcp-client',
  version: '1.0.0',
});

await mcpClient.connect(serverParams);
const tools = [mcpToTool(mcpClient)];

// Use with Google Gemini
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const stream = await gemini.models.generateContentStream({
  model: 'gemini-2.5-flash',
  contents: 'Your prompt here',
  config: { tools },
});
```

### Mastra Provider

Returns a key-value mapping of server configurations:

```typescript
import { MastraProvider } from '@composio/mastra';
import { MCPClient as MastraMCPClient } from '@mastra/mcp';

const composio = new Composio({
  provider: new MastraProvider(),
});

const servers = await composio.experimental.mcp.getServer(userId, configId);
// Returns: Record<string, { url: string }>
// {
//   "server-0": { url: "https://mcp.composio.dev/..." }
// }

// Use with Mastra
const mcpClient = new MastraMCPClient({ servers });
const tools = await mcpClient.getTools();

const agent = new MastraAgent({
  name: 'Gmail Assistant',
  model: openai('gpt-4o-mini'),
  tools: wrapTools(servers, tools),
});
```

### Vercel AI Provider

Returns a URL string for use with Vercel AI's MCP client:

```typescript
import { VercelProvider } from '@composio/vercel';
import { experimental_createMCPClient as createMCPClient, streamText } from 'ai';

const composio = new Composio({
  provider: new VercelProvider(),
});

const url = await composio.experimental.mcp.getServer(userId, configId);
// Returns: string (URL)

// Create Vercel AI MCP client
const serverParams = new SSEClientTransport(url);
const mcpClient = await createMCPClient({
  name: 'composio-mcp-client',
  transport: serverParams,
});

const tools = await mcpClient.tools();

// Use with Vercel AI
const stream = streamText({
  model: openai('gpt-4o-mini'),
  messages: [...],
  tools,
});
```

### OpenAI Provider

Returns an array of server configurations:

```typescript
import { OpenAIProvider } from '@composio/openai';

const composio = new Composio({
  provider: new OpenAIProvider(),
});

const servers = await composio.experimental.mcp.getServer(userId, configId);
// Returns: McpServerUrlInfo[]
```

## Complete Examples

### Anthropic Claude Example

```typescript
import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';
import Anthropic from '@anthropic-ai/sdk';

// 1. Initialize Composio with experimental MCP
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new AnthropicProvider({ cacheTools: true }),
});

// 2. Create MCP configuration
const mcpConfig = await composio.experimental.mcpConfig.create(
  `gmail-assistant-${Date.now()}`,
  [
    {
      authConfigId: "ac_your_gmail_config",
      allowedTools: ["GMAIL_FETCH_EMAILS", "GMAIL_SEND_EMAIL"]
    }
  ],
  { isChatAuth: true }
);

// 3. Get server URLs for connected account
const servers = await composio.experimental.mcp.getServer(
  "user123",
  mcpConfig.id,
  { limitTools: ["GMAIL_FETCH_EMAILS"] }
);

// 4. Use with Anthropic Claude
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const stream = anthropic.beta.messages.stream({
  model: 'claude-4-sonnet-20250514',
  max_tokens: 64_000,
  mcp_servers: servers,
  messages: [
    {
      role: 'user',
      content: 'Fetch my latest 3 emails and summarize them',
    },
  ],
  betas: ['mcp-client-2025-04-04'],
});

for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    process.stdout.write(event.delta.text);
  }
}
```

### Google Gemini Example

```typescript
import { Composio } from '@composio/core';
import { GoogleProvider } from '@composio/google';
import { GoogleGenAI, mcpToTool } from '@google/genai';
import { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// 1. Initialize Composio
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new GoogleProvider(),
});

// 2. Create MCP configuration
const mcpConfig = await composio.experimental.mcpConfig.create(
  `gmail-assistant-${Date.now()}`,
  [
    {
      authConfigId: "ac_your_gmail_config",
      allowedTools: ["GMAIL_FETCH_EMAILS"]
    }
  ],
  { isChatAuth: true }
);

// 3. Get server URL
const url = await composio.experimental.mcp.getServer(
  "user123",
  mcpConfig.id
);

// 4. Create MCP client
const serverParams = new SSEClientTransport(url);
const mcpClient = new MCPClient({
  name: 'composio-mcp-client',
  version: '1.0.0',
});

await mcpClient.connect(serverParams);
const tools = [mcpToTool(mcpClient)];

// 5. Use with Google Gemini
const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const stream = await gemini.models.generateContentStream({
  model: 'gemini-2.5-flash',
  contents: 'Fetch my latest 2 emails and provide a summary',
  config: { tools },
});

for await (const chunk of stream) {
  console.log(chunk.text);
}

await mcpClient.close();
```

### Mastra Example

```typescript
import { openai } from '@ai-sdk/openai';
import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';
import { MCPClient as MastraMCPClient } from '@mastra/mcp';
import { Agent as MastraAgent } from '@mastra/core/agent';

// Helper function to remove server prefixes from tool names
function wrapTools(servers: Record<string, any>, tools: Record<string, any>): Record<string, any> {
  const prefixes = Object.keys(servers);
  
  function removePrefix(str: string): string {
    for (const prefix of prefixes) {
      if (str.startsWith(prefix)) {
        return str.slice(prefix.length + 1);
      }
    }
    return str;
  }
  
  return Object.fromEntries(
    Object.entries(tools).map(([key, tool]) => {
      return [removePrefix(key), tool] as const;
    })
  );
}

// 1. Initialize Composio
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new MastraProvider(),
});

// 2. Create MCP configuration
const mcpConfig = await composio.experimental.mcpConfig.create(
  `gmail-assistant-${Date.now()}`,
  [
    {
      authConfigId: "ac_your_gmail_config",
      allowedTools: ["GMAIL_FETCH_EMAILS"]
    }
  ],
  { isChatAuth: true }
);

// 3. Get server URLs
const servers = await composio.experimental.mcp.getServer(
  "user123",
  mcpConfig.id
);

// 4. Create Mastra MCP client
const mcpClient = new MastraMCPClient({ servers });
const tools = await mcpClient.getTools();

// 5. Create Mastra agent
const agent = new MastraAgent({
  name: 'Gmail Assistant',
  instructions: 'You are a helpful Gmail assistant.',
  model: openai('gpt-4o-mini'),
  tools: wrapTools(servers, tools),
});

// 6. Use the agent
const response = await agent.generate(
  'Fetch my latest 2 emails and provide a summary'
);
console.log(response.text);

await mcpClient.disconnect();
```

## Configuration Management

### Auth Configuration

Before creating MCP configurations, you need to set up authentication configurations for your toolkits:

```typescript
// Create an auth configuration for Gmail
const authConfig = await composio.authConfigs.create({
  toolkit: 'gmail',
  authScheme: 'OAUTH2',
  // Additional auth parameters...
});

// Use the auth config ID in your MCP configuration
const mcpConfig = await composio.experimental.mcpConfig.create(
  "gmail-server",
  [
    {
      authConfigId: authConfig.id,
      allowedTools: ["GMAIL_FETCH_EMAILS", "GMAIL_SEND_EMAIL"]
    }
  ],
  { isChatAuth: true }
);
```

### Tool Selection

You can specify exactly which tools to expose through your MCP server:

```typescript
const mcpConfig = await composio.experimental.mcpConfig.create(
  "multi-toolkit-server",
  [
    {
      authConfigId: "ac_gmail_config",
      allowedTools: [
        "GMAIL_FETCH_EMAILS",
        "GMAIL_SEND_EMAIL",
        "GMAIL_CREATE_DRAFT"
      ]
    },
    {
      authConfigId: "ac_slack_config",
      allowedTools: [
        "SLACK_SEND_MESSAGE",
        "SLACK_LIST_CHANNELS"
      ]
    }
  ],
  { isChatAuth: true }
);
```

### Runtime Tool Limiting

You can further limit tools when getting server URLs:

```typescript
const servers = await composio.experimental.mcp.getServer(
  "user123",
  mcpConfig.id,
  {
    limitTools: ["GMAIL_FETCH_EMAILS"], // Only expose this tool
    isChatAuth: true
  }
);
```

## Types

### MCPServerConfig

```typescript
interface MCPServerConfig {
  authConfigId: string;    // Authentication configuration ID
  allowedTools: string[];  // Array of tool IDs to expose
}
```

### MCPConfigOptions

```typescript
interface MCPConfigOptions {
  isChatAuth?: boolean;  // Use Composio-managed authentication
}
```

### McpServerCreateResponse

```typescript
interface McpServerCreateResponse<T> {
  id: string;                    // Configuration UUID
  name: string;                  // Configuration name
  toolkits: string[];           // Array of toolkit names
  createdAt?: string;           // Creation timestamp
  updatedAt?: string;           // Last update timestamp
  getServer: (params: {         // Convenience method
    userId?: string;
    limitTools?: string[];
    isChatAuth?: boolean;
  }) => Promise<T>;
}
```

### Provider-Specific Response Types

#### McpServerUrlInfo (Anthropic, OpenAI, etc.)

```typescript
interface McpServerUrlInfo {
  url: URL;           // MCP server URL
  name: string;       // Server instance name  
  toolkit?: string;   // Associated toolkit
}
```

#### Mastra Server Format

```typescript
type MastraServerFormat = Record<string, {
  url: string;  // MCP server URL
}>;
```

## Best Practices

### 1. Configuration Naming

Use descriptive names that indicate the purpose and scope:

```typescript
// Good
await composio.experimental.mcpConfig.create(
  "gmail-support-assistant",
  [...],
  { isChatAuth: true }
);

// Avoid
await composio.experimental.mcpConfig.create(
  "config1",
  [...],
  { isChatAuth: true }
);
```

### 2. Tool Selection

Be specific about which tools to expose:

```typescript
// Good - specific tools for the use case
const mcpConfig = await composio.experimental.mcpConfig.create(
  "email-assistant",
  [
    {
      authConfigId: "ac_gmail",
      allowedTools: [
        "GMAIL_FETCH_EMAILS",
        "GMAIL_SEND_EMAIL", 
        "GMAIL_CREATE_DRAFT"
      ]
    }
  ],
  { isChatAuth: true }
);

// Avoid - exposing unnecessary tools
const mcpConfig = await composio.experimental.mcpConfig.create(
  "email-assistant", 
  [
    {
      authConfigId: "ac_gmail",
      allowedTools: ["*"] // Exposes all tools
    }
  ],
  { isChatAuth: true }
);
```

### 3. Authentication Management

Use Composio-managed authentication when possible:

```typescript
// Recommended
const mcpConfig = await composio.experimental.mcpConfig.create(
  "server-name",
  [...],
  { isChatAuth: true }  // Let Composio handle auth
);
```

### 4. Error Handling

Always handle potential errors:

```typescript
try {
  const mcpConfig = await composio.experimental.mcpConfig.create(
    "server-name",
    serverConfigs,
    { isChatAuth: true }
  );
  
  const servers = await composio.experimental.mcp.getServer(
    userId,
    mcpConfig.id
  );
  
  // Use servers with your AI framework
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Configuration error:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### 5. Resource Cleanup

Clean up MCP clients when done:

```typescript
// For generic MCP clients
await mcpClient.close();

// For Mastra clients
await mcpClient.disconnect();
```

## Migration from Standard MCP

If you're using the standard MCP API, here's how to migrate:

### Before (Standard MCP)

```typescript
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new AnthropicProvider()
});

const server = await composio.mcp.create(
  "server-name",
  [
    {
      toolkit: "gmail",
      authConfigId: "ac_config",
      allowedTools: ["GMAIL_FETCH_EMAILS"]
    }
  ],
  { isChatAuth: true }
);

const urls = await server.getServer({
  userId: "user123"
});
```

### After (Experimental MCP)

```typescript
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new AnthropicProvider(),
});

const mcpConfig = await composio.experimental.mcpConfig.create(
  "server-name",
  [
    {
      authConfigId: "ac_config",
      allowedTools: ["GMAIL_FETCH_EMAILS"]
    }
  ],
  { isChatAuth: true }
);

const servers = await composio.experimental.mcp.getServer(
  "user123",
  mcpConfig.id
);
```

## Troubleshooting

### Common Issues

1. **Provider mismatch**: Ensure your provider supports the experimental MCP features
2. **Auth config not found**: Verify your auth configuration IDs are correct
3. **Tool not available**: Check that tools are properly configured in your auth config
4. **Connection timeout**: MCP clients need to remain active while tools are being used

### Debug Mode

Enable debug logging to troubleshoot issues:

```typescript
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new AnthropicProvider(),
  // Additional debug configuration if available
});
```

The experimental MCP API provides a powerful and flexible way to integrate Composio's tools with modern AI frameworks. By leveraging provider-specific optimizations and simplified configuration management, you can build more robust and maintainable AI applications.
