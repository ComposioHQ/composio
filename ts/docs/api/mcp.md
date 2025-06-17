
# MCP (Model Control Protocol) API

The `MCP` class provides methods to manage Model Control Protocol servers, enabling AI models to interact with external tools and services through a standardized protocol. MCP servers act as bridges between AI agents and various toolkits, providing secure and managed access to external capabilities.

## Overview

MCP (Model Control Protocol) is a protocol for exposing tools and capabilities to AI models in a standardized way. With Composio's MCP integration, you can:

- Create MCP servers that expose specific toolkits and tools
- Manage authentication for MCP servers
- Generate secure URLs for AI agents to connect to MCP servers
- Support multiple AI frameworks through provider-specific transformations

## Methods

### create(name, toolkitConfigs, authOptions?)

Creates a new MCP server with specified toolkit configurations.

```typescript
// Create an MCP server with Gmail toolkit
const server = await composio.mcp.create(
  "my-gmail-server",
  [
    {
      toolkit: "gmail",
      authConfigId: "ac_sdhkjfhjksdk",
      allowedTools: ["GMAIL_FETCH_EMAILS", "GMAIL_SEND_EMAIL"]
    }
  ],
  { useComposioManagedAuth: true }
);

// Create an MCP server with multiple toolkits
const multiToolServer = await composio.mcp.create(
  "multi-tool-server",
  [
    {
      toolkit: "github",
      authConfigId: "ac_github123",
      allowedTools: ["GITHUB_CREATE_ISSUE", "GITHUB_GET_REPO"]
    },
    {
      toolkit: "slack",
      authConfigId: "ac_slack456", 
      allowedTools: ["SLACK_SEND_MESSAGE"]
    }
  ]
);

// Use the convenience method to get server URLs
const urls = await server.getServer({
  connectedAccountIds: { gmail: "connected_account_id" }
});
```

**Parameters:**

- `name` (string): Unique name for the MCP server
- `toolkitConfigs` (MCPToolkitConfig[]): Array of toolkit configurations
  - `toolkit`: The toolkit slug (e.g., "gmail", "github")
  - `authConfigId`: The auth configuration ID to use
  - `allowedTools`: Array of specific tool IDs to expose
- `authOptions` (MCPAuthOptions): Optional authentication options
  - `useComposioManagedAuth`: Whether to use Composio-managed authentication

**Returns:** Promise<McpServerCreateResponse> - Created server details with convenience `getServer` method

**Throws:** ValidationError if configurations are invalid or server creation fails

### getServer(id, params, authOptions?)

Retrieves server URLs for an existing MCP server. This method generates secure URLs that AI agents can use to connect to the MCP server.

```typescript
// Get URLs for a server using connected account IDs
const urls = await composio.mcp.getServer("server-uuid", {
  connectedAccountIds: {
    gmail: "connected_account_123",
    github: "connected_account_456"
  }
});

// Get URLs for a server using user ID
const userUrls = await composio.mcp.getServer("server-uuid", {
  userId: "user_123"
});

// Override authentication options
const customAuthUrls = await composio.mcp.getServer(
  "server-uuid",
  { userId: "user_123" },
  { useComposioManagedAuth: false }
);
```

**Parameters:**

- `id` (string): Server UUID
- `params` (MCPGetServerParams): Parameters for getting server URLs
  - Either `connectedAccountIds` (object mapping toolkit names to account IDs) OR `userId` (string)
- `authOptions` (MCPAuthOptions): Optional authentication options to override server defaults

**Returns:** Promise<T> - Transformed server URLs in provider-specific format

**Throws:** ValidationError if parameters are invalid or URL generation fails

### list(options)

Lists MCP server configurations with filtering options.

```typescript
// List all servers with pagination
const servers = await composio.mcp.list({
  page: 1,
  limit: 10
});

// List servers for specific toolkits
const gmailServers = await composio.mcp.list({
  toolkits: ['gmail', 'google-calendar'],
  limit: 20
});

// List servers by auth config
const authFilteredServers = await composio.mcp.list({
  authConfigs: ['auth_123', 'auth_456'],
  name: 'production'
});
```

**Parameters:**

- `options` (object): Filtering and pagination options
  - `page`: Page number for pagination (default: 1)
  - `limit`: Number of items per page (default: 10)
  - `toolkits`: Filter by toolkit names
  - `authConfigs`: Filter by auth config IDs
  - `name`: Filter by server name

**Returns:** Promise<McpListResponse> - List of MCP servers

### get(id)

Retrieves details of a specific MCP server.

```typescript
const serverDetails = await composio.mcp.get('server-uuid');
console.log(serverDetails.name);
console.log(serverDetails.toolkits);
console.log(serverDetails.status);
```

**Parameters:**

- `id` (string): Server UUID

**Returns:** Promise<McpRetrieveResponse> - Server details including configuration and metadata

### update(id, name, toolkitConfigs, authOptions?)

Updates an MCP server configuration.

```typescript
const updatedServer = await composio.mcp.update(
  "server-uuid",
  "updated-server-name",
  [
    {
      toolkit: "gmail",
      authConfigId: "ac_new_auth_config",
      allowedTools: ["GMAIL_FETCH_EMAILS", "GMAIL_SEND_EMAIL", "GMAIL_CREATE_DRAFT"]
    }
  ],
  { useComposioManagedAuth: true }
);
```

**Parameters:**

- `id` (string): Server UUID
- `name` (string): New name for the server
- `toolkitConfigs` (MCPToolkitConfig[]): Updated toolkit configurations
- `authOptions` (MCPAuthOptions): Updated authentication options

**Returns:** Promise<McpUpdateResponse> - Updated server details

### delete(id)

Deletes an MCP server.

```typescript
const result = await composio.mcp.delete('server-uuid');
console.log(result.deleted); // true
```

**Parameters:**

- `id` (string): Server UUID

**Returns:** Promise<McpDeleteResponse> - Deletion confirmation

### generateUrl(params)

Generates URLs for MCP server access. This is a lower-level method primarily used internally.

```typescript
const urlResponse = await composio.mcp.generateUrl({
  userIds: ['user123'],
  connectedAccountIds: ['account456'],
  mcpServerId: 'server-uuid',
  managedAuthByComposio: true
});
```

**Parameters:**

- `params` (GenerateURLParams): URL generation parameters
  - `userIds`: Array of user IDs
  - `connectedAccountIds`: Array of connected account IDs
  - `mcpServerId`: MCP server ID
  - `managedAuthByComposio`: Whether to use Composio-managed auth

**Returns:** Promise<GenerateURLResponse> - Generated URLs

## Provider Integration

Different AI frameworks expect MCP server URLs in different formats. Composio automatically handles these transformations through provider-specific implementations.

### Using with Providers

```typescript
import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';
import { AnthropicProvider } from '@composio/anthropic';

// With Mastra provider - returns key-value URL mapping
const composioMastra = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new MastraProvider()
});

const mastraServer = await composioMastra.mcp.create(...);
const mastraUrls = await mastraServer.getServer({
  connectedAccountIds: { gmail: "account_id" }
});
// Returns: { "server-0": { url: "..." } }

// With Anthropic provider - returns array of server info
const composioAnthropic = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new AnthropicProvider()
});

const anthropicServer = await composioAnthropic.mcp.create(...);
const anthropicUrls = await anthropicServer.getServer({
  connectedAccountIds: { gmail: "account_id" }
});
// Returns: [{ url: URL, name: "...", toolkit: "gmail" }]
```

### Supported Providers

- **Anthropic** - Returns McpServerUrlInfo[]
- **OpenAI** - Returns McpServerUrlInfo[]
- **LangChain** - Returns McpServerUrlInfo[]
- **Vercel** - Returns McpServerUrlInfo[]
- **Google** - Returns McpServerUrlInfo[]
- **CloudFlare** - Returns McpServerUrlInfo[]
- **Mastra** - Returns custom key-value URL mapping

## Types

### MCPToolkitConfig

```typescript
interface MCPToolkitConfig {
  toolkit: string;          // Toolkit slug (e.g., "gmail", "github")
  authConfigId: string;     // Auth configuration ID
  allowedTools: string[];   // Array of allowed tool IDs
}
```

### MCPAuthOptions

```typescript
interface MCPAuthOptions {
  useComposioManagedAuth?: boolean;  // Use Composio-managed authentication
}
```

### MCPGetServerParams

```typescript
interface MCPGetServerParams {
  userId?: string;                                  // User ID (XOR with connectedAccountIds)
  connectedAccountIds?: Record<string, string>;     // Toolkit to account ID mapping
}
```

### McpServerCreateResponse

```typescript
interface McpServerCreateResponse<T> {
  id: string;                                      // Server UUID
  name: string;                                    // Server name
  createdAt?: string;                             // Creation timestamp
  updatedAt?: string;                             // Last update timestamp
  status?: string;                                // Server status
  toolkits: string[];                             // List of enabled toolkits
  getServer: (params: MCPGetServerParams) => Promise<T>;  // Convenience method
}
```

### McpListResponse

```typescript
interface McpListResponse {
  items?: Array<{
    id: string;
    name: string;
    createdAt?: string;
    updatedAt?: string;
    status?: string;
  }>;
}
```

### McpServerUrlInfo

```typescript
interface McpServerUrlInfo {
  url: URL;           // MCP server URL
  name: string;       // Server instance name
  toolkit?: string;   // Associated toolkit
}
```

## Complete Example

Here's a complete example of using MCP with an AI agent:

```typescript
import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';
import { MCPClient } from '@mastra/mcp';
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';

// Initialize Composio with Mastra provider
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new MastraProvider(),
});

// Create an MCP server with Gmail toolkit
const mcpServer = await composio.mcp.create(
  "gmail-assistant",
  [
    {
      toolkit: "gmail",
      authConfigId: "ac_your_auth_config",
      allowedTools: ["GMAIL_FETCH_EMAILS", "GMAIL_SEND_EMAIL"]
    }
  ],
  { useComposioManagedAuth: true }
);

// Get server URLs for connected accounts
const serverUrls = await mcpServer.getServer({
  connectedAccountIds: {
    "gmail": "your_connected_account_id"
  }
});

// Initialize MCP client with the server URLs
const mcpClient = new MCPClient({
  servers: Object.fromEntries(
    Object.entries(serverUrls).map(([key, value]) => [
      key,
      { url: new URL(value.url) }
    ])
  )
});

// Get available tools from MCP
const tools = await mcpClient.getTools();

// Create an AI agent with MCP tools
const gmailAgent = new Agent({
  name: 'Gmail Assistant',
  instructions: 'You are a helpful Gmail assistant.',
  model: openai('gpt-4'),
  tools,
});

// Use the agent
const response = await gmailAgent.generate('Fetch my latest emails');
console.log(response.text);
```

## Best Practices

1. **Toolkit Selection**: Only expose the tools that your AI agent needs to minimize the attack surface
2. **Authentication**: Use Composio-managed authentication when possible for better security
3. **Error Handling**: Always handle validation errors when creating or updating servers
4. **Provider Choice**: Choose the appropriate provider based on your AI framework
5. **Server Naming**: Use descriptive names that indicate the server's purpose
6. **Tool Allowlisting**: Be specific about which tools to expose rather than exposing entire toolkits

## Error Handling

All MCP methods throw `ValidationError` when:
- Input parameters fail Zod schema validation
- API responses don't match expected schemas
- Server operations fail (create, update, delete)
- URL generation fails

```typescript
try {
  const server = await composio.mcp.create("my-server", toolkitConfigs);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation failed:', error.message);
    console.error('Cause:', error.cause);
  }
}
``` 