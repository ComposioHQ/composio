# MCP (Model Control Protocol) API

The MCP API provides comprehensive Model Control Protocol capabilities for integrating Composio tools with modern AI frameworks. This API offers streamlined MCP server creation, management, and user-specific URL generation.

## Overview

Key benefits of the MCP API:

- **Flexible configuration**: Support for multiple toolkits and authentication methods
- **User-specific servers**: Generate unique MCP server URLs for individual users
- **Comprehensive management**: Full CRUD operations for MCP server configurations
- **Authentication flexibility**: Choose between manual account management or Composio-managed authentication

## Getting Started

### Using MCP API

The MCP features are available by default when you initialize Composio:

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});
```

### Basic Usage Pattern

```typescript
// 1. Create MCP configuration
const mcpConfig = await composio.mcp.create('my-server-name', {
  toolkits: [{ toolkit: 'github', authConfigId: 'ac_233434343' }],
  allowedTools: ['GITHUB_CREATE_ISSUE', 'GITHUB_LIST_REPOS'],
  manuallyManageConnections: false,
});

// 2. Generate server instance for a user
const serverInstance = await composio.mcp.generate('user123', mcpConfig.id);

// 3. Use the server URL with any MCP client
const mcpUrl = serverInstance.url;
```

## API Reference

### composio.mcp

#### create(name, mcpConfig)

Creates a new MCP server configuration with the specified toolkit settings.

```typescript
const mcpConfig = await composio.mcp.create('gmail-assistant', {
  toolkits: [
    { toolkit: 'gmail', authConfigId: 'ac_gmail_config' },
    { toolkit: 'slack', authConfigId: 'ac_slack_config' },
  ],
  allowedTools: ['GMAIL_FETCH_EMAILS', 'GMAIL_SEND_EMAIL', 'SLACK_SEND_MESSAGE'],
  manuallyManageConnections: false,
});

// Alternative with string toolkit names
const mcpConfig = await composio.mcp.create('simple-server', {
  toolkits: ['github', 'slack'],
  allowedTools: ['GITHUB_CREATE_ISSUE', 'SLACK_SEND_MESSAGE'],
  manuallyManageConnections: false,
});
```

**Parameters:**

- `name` (string): Unique name for the MCP server configuration
- `mcpConfig` (object): MCP configuration parameters
  - `toolkits` (Array): Array of toolkit configurations - can be strings or objects
    - As string: Just the toolkit name (e.g., "github", "slack")
    - As object: `{ toolkit?: string, authConfigId?: string }`
  - `allowedTools` (string[], optional): Array of specific tool IDs to expose
  - `manuallyManageConnections` (boolean, optional): Whether to manually manage account connections. If false, Composio will inject account management tools. Defaults to false.

**Returns:** `Promise<MCPConfigCreateResponse>` - Created server details including:

- `id`: Server configuration UUID
- `name`: Server name
- `allowedTools`: Array of allowed tool IDs
- `authConfigIds`: Array of auth configuration IDs
- `commands`: Setup commands for different MCP clients (Claude, Cursor, Windsurf)
- `MCPUrl`: Base MCP server URL
- `generate`: Convenience method to generate user-specific server instances

#### generate(userId, mcpConfigurationId, options?)

Generates a user-specific MCP server instance with a unique URL.

```typescript
const serverInstance = await composio.mcp.generate('user123', 'mcp_config_uuid', {
  manuallyManageConnections: false,
});
```

**Parameters:**

- `userId` (string): ID of the user to generate server instance for
- `mcpConfigurationId` (string): UUID of the MCP configuration
- `options` (object, optional): Additional server options
  - `manuallyManageConnections` (boolean): Override authentication method

**Returns:** `Promise<MCPServerInstance>` - Server instance details including:

- `id`: Server configuration ID
- `name`: Server name
- `type`: Connection type (always 'streamable_http')
- `url`: User-specific MCP server URL
- `userId`: Associated user ID
- `allowedTools`: Array of available tool IDs
- `authConfigs`: Array of auth configuration IDs

#### list(options)

Lists MCP server configurations with optional filtering and pagination.

```typescript
// List all MCP servers
const allServers = await composio.mcp.list({});

// List with pagination
const pagedServers = await composio.mcp.list({
  page: 2,
  limit: 5
});

// Filter by toolkit
const githubServers = await composio.mcp.list({
  toolkits: ['github', 'slack']
});

// Filter by name
const namedServers = await composio.mcp.list({
  name: 'personal'
});
```

**Parameters:**

- `options` (object): Filtering and pagination options
  - `page` (number, optional): Page number for pagination (1-based, defaults to 1)
  - `limit` (number, optional): Maximum items per page (defaults to 10)
  - `toolkits` (string[], optional): Filter by toolkit names
  - `authConfigs` (string[], optional): Filter by auth configuration IDs
  - `name` (string, optional): Filter by server name (partial match)

**Returns:** `Promise<MCPListResponse>` - Paginated list with metadata:

- `items`: Array of MCP server configurations
- `currentPage`: Current page number
- `totalPages`: Total number of pages

#### get(serverId)

Retrieves detailed information about a specific MCP server.

```typescript
const server = await composio.mcp.get("mcp_12345");

console.log(server.name); // "My Personal MCP Server"
console.log(server.allowedTools); // ["GITHUB_CREATE_ISSUE", "SLACK_SEND_MESSAGE"]
console.log(server.toolkits); // ["github", "slack"]
console.log(server.serverInstanceCount); // 3

// Access setup commands for different clients
console.log(server.commands.claude); // Claude setup command
console.log(server.commands.cursor); // Cursor setup command
console.log(server.commands.windsurf); // Windsurf setup command
```

**Parameters:**

- `serverId` (string): The unique identifier of the MCP server

**Returns:** `Promise<MCPItem>` - Complete server details including configuration, tools, and metadata

#### update(serverId, config)

Updates an existing MCP server configuration.

```typescript
// Update server name only
const updatedServer = await composio.mcp.update("mcp_12345", {
  name: "My Updated MCP Server"
});

// Update toolkits and tools
const serverWithNewTools = await composio.mcp.update("mcp_12345", {
  toolkits: [
    {
      toolkit: "github",
      authConfigId: "auth_abc123"
    },
    {
      toolkit: "slack", 
      authConfigId: "auth_xyz789"
    }
  ],
  allowedTools: ["GITHUB_CREATE_ISSUE", "GITHUB_LIST_REPOS", "SLACK_SEND_MESSAGE"]
});
```

**Parameters:**

- `serverId` (string): The unique identifier of the MCP server to update
- `config` (object): Update configuration parameters
  - `name` (string, optional): New name for the MCP server
  - `toolkits` (Array, optional): Updated toolkit configurations
  - `allowedTools` (string[], optional): Updated list of allowed tools
  - `manuallyManageConnections` (boolean, optional): Updated connection management setting

**Returns:** `Promise<MCPItem>` - Updated MCP server configuration

#### delete(serverId)

Permanently deletes an MCP server configuration.

```typescript
const result = await composio.mcp.delete("mcp_12345");

if (result.deleted) {
  console.log(`Server ${result.id} has been successfully deleted`);
}
```

**Parameters:**

- `serverId` (string): The unique identifier of the MCP server to delete

**Returns:** `Promise<{id: string; deleted: boolean}>` - Deletion confirmation

**⚠️ Warning:** This operation is irreversible. Once deleted, the MCP server configuration and all its associated data will be permanently removed.

## Complete Examples

### Basic MCP Server Setup

```typescript
import { Composio } from '@composio/core';

// 1. Initialize Composio
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

// 2. Create MCP configuration
const mcpConfig = await composio.mcp.create('gmail-assistant', {
  toolkits: [{ toolkit: 'gmail', authConfigId: 'ac_your_gmail_config' }],
  allowedTools: ['GMAIL_FETCH_EMAILS', 'GMAIL_SEND_EMAIL'],
  manuallyManageConnections: false,
});

console.log('MCP Configuration created:', mcpConfig.id);
console.log('Setup commands:');
console.log('Claude:', mcpConfig.commands.claude);
console.log('Cursor:', mcpConfig.commands.cursor);
console.log('Windsurf:', mcpConfig.commands.windsurf);

// 3. Generate server instance for a user
const serverInstance = await composio.mcp.generate('user123', mcpConfig.id);

console.log('MCP Server URL for user123:', serverInstance.url);
console.log('Available tools:', serverInstance.allowedTools);
```

### Using with Generic MCP Client

```typescript
import { Composio } from '@composio/core';
import { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// 1. Initialize Composio and create MCP configuration
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const mcpConfig = await composio.mcp.create('multi-toolkit-assistant', {
  toolkits: [
    { toolkit: 'gmail', authConfigId: 'ac_gmail_config' },
    { toolkit: 'github', authConfigId: 'ac_github_config' },
  ],
  allowedTools: [
    'GMAIL_FETCH_EMAILS',
    'GMAIL_SEND_EMAIL', 
    'GITHUB_CREATE_ISSUE',
    'GITHUB_LIST_REPOS'
  ],
  manuallyManageConnections: false,
});

// 2. Generate server instance for a specific user
const serverInstance = await composio.mcp.generate('user456', mcpConfig.id);

// 3. Create MCP client connection
const transport = new SSEClientTransport(new URL(serverInstance.url));
const mcpClient = new MCPClient({
  name: 'composio-mcp-client',
  version: '1.0.0',
});

await mcpClient.connect(transport);

// 4. List available tools
const { tools } = await mcpClient.listTools();
console.log('Available tools:', tools.map(t => t.name));

// 5. Call a tool
const result = await mcpClient.callTool({
  name: 'GMAIL_FETCH_EMAILS',
  arguments: {
    limit: 5
  }
});

console.log('Email fetch result:', result);

// 6. Clean up
await mcpClient.close();
```

### Managing Multiple Servers

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

// Create multiple MCP configurations for different use cases
const personalConfig = await composio.mcp.create('personal-assistant', {
  toolkits: ['gmail', 'calendar'],
  allowedTools: ['GMAIL_FETCH_EMAILS', 'CALENDAR_LIST_EVENTS'],
  manuallyManageConnections: false,
});

const workConfig = await composio.mcp.create('work-assistant', {
  toolkits: [
    { toolkit: 'github', authConfigId: 'ac_work_github' },
    { toolkit: 'slack', authConfigId: 'ac_work_slack' },
  ],
  allowedTools: ['GITHUB_CREATE_ISSUE', 'SLACK_SEND_MESSAGE'],
  manuallyManageConnections: false,
});

// List all configurations
const allConfigs = await composio.mcp.list({});
console.log(`Total configurations: ${allConfigs.items.length}`);

// Generate instances for different users
const personalInstance = await composio.mcp.generate('user123', personalConfig.id);
const workInstance = await composio.mcp.generate('user123', workConfig.id);

console.log('Personal MCP URL:', personalInstance.url);
console.log('Work MCP URL:', workInstance.url);

// Update a configuration
const updatedConfig = await composio.mcp.update(personalConfig.id, {
  name: 'Enhanced Personal Assistant',
  allowedTools: [
    'GMAIL_FETCH_EMAILS', 
    'GMAIL_SEND_EMAIL',
    'CALENDAR_LIST_EVENTS',
    'CALENDAR_CREATE_EVENT'
  ]
});

console.log('Updated configuration:', updatedConfig.name);
```

### Vercel AI Integration Example

```typescript
import { Composio } from '@composio/core';
import { experimental_createMCPClient as createMCPClient, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// 1. Initialize Composio and create MCP configuration
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const mcpConfig = await composio.mcp.create('ai-assistant', {
  toolkits: [{ toolkit: 'gmail', authConfigId: 'ac_gmail_config' }],
  allowedTools: ['GMAIL_FETCH_EMAILS', 'GMAIL_SEND_EMAIL'],
  manuallyManageConnections: false,
});

// 2. Generate server instance
const serverInstance = await composio.mcp.generate('user789', mcpConfig.id);

// 3. Create Vercel AI MCP client
const transport = new SSEClientTransport(new URL(serverInstance.url));
const mcpClient = await createMCPClient({
  name: 'composio-mcp-client',
  transport: transport,
});

const tools = await mcpClient.tools();

// 4. Use with Vercel AI
const stream = streamText({
  model: openai('gpt-4o-mini'),
  messages: [
    {
      role: 'user',
      content: 'Fetch my latest 3 emails and provide a summary of each one',
    },
  ],
  tools,
});

// 5. Stream the response
for await (const textPart of stream.textStream) {
  process.stdout.write(textPart);
}

// 6. Clean up
await mcpClient.close();
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
const mcpConfig = await composio.mcp.create('gmail-server', {
  toolkits: [{ toolkit: 'gmail', authConfigId: authConfig.id }],
  allowedTools: ['GMAIL_FETCH_EMAILS', 'GMAIL_SEND_EMAIL'],
  manuallyManageConnections: false,
});
```

### Tool Selection

You can specify exactly which tools to expose through your MCP server:

```typescript
const mcpConfig = await composio.mcp.create('multi-toolkit-server', {
  toolkits: [
    { toolkit: 'gmail', authConfigId: 'ac_gmail_config' },
    { toolkit: 'slack', authConfigId: 'ac_slack_config' },
  ],
  allowedTools: [
    'GMAIL_FETCH_EMAILS',
    'GMAIL_SEND_EMAIL',
    'GMAIL_CREATE_DRAFT',
    'SLACK_SEND_MESSAGE',
    'SLACK_LIST_CHANNELS',
  ],
  manuallyManageConnections: false,
});
```

### Flexible Toolkit Configuration

You can configure toolkits in multiple ways:

```typescript
// Using string array (requires default auth configs)
const simpleConfig = await composio.mcp.create('simple-server', {
  toolkits: ['github', 'slack'],
  allowedTools: ['GITHUB_CREATE_ISSUE', 'SLACK_SEND_MESSAGE'],
  manuallyManageConnections: false,
});

// Using mixed configuration
const mixedConfig = await composio.mcp.create('mixed-server', {
  toolkits: [
    'calendar', // Uses default auth config
    { toolkit: 'gmail', authConfigId: 'ac_specific_gmail' }, // Uses specific auth config
    { authConfigId: 'ac_custom_integration' }, // Uses auth config without toolkit name
  ],
  manuallyManageConnections: false,
});
```

## Types

### MCPConfigCreationParams

```typescript
interface MCPConfigCreationParams {
  toolkits: Array<string | MCPConfigToolkits>; // Array of toolkit configurations
  allowedTools?: string[]; // Optional array of specific tool IDs to expose
  manuallyManageConnections?: boolean; // Whether to manually manage account connections (default: false)
}

interface MCPConfigToolkits {
  toolkit?: string; // Toolkit identifier (e.g., "github", "slack")
  authConfigId?: string; // Authentication configuration ID
}
```

### MCPConfigCreateResponse

```typescript
interface MCPConfigCreateResponse {
  id: string; // Configuration UUID
  name: string; // Configuration name
  allowedTools: string[]; // Array of allowed tool IDs
  authConfigIds: string[]; // Array of auth configuration IDs
  commands: {
    claude: string; // Claude setup command
    cursor: string; // Cursor setup command
    windsurf: string; // Windsurf setup command
  };
  MCPUrl: string; // Base MCP server URL
  generate: (userId: string) => Promise<MCPServerInstance>; // Convenience method
}
```

### MCPServerInstance

```typescript
interface MCPServerInstance {
  id: string; // Server configuration ID
  name: string; // Server name
  type: 'streamable_http'; // Connection type
  url: string; // User-specific MCP server URL
  userId: string; // Associated user ID
  allowedTools: string[]; // Array of available tool IDs
  authConfigs: string[]; // Array of auth configuration IDs
}
```

### MCPListParams

```typescript
interface MCPListParams {
  page?: number; // Page number for pagination (1-based, default: 1)
  limit?: number; // Maximum items per page (default: 10)
  toolkits?: string[]; // Filter by toolkit names
  authConfigs?: string[]; // Filter by auth configuration IDs
  name?: string; // Filter by server name (partial match)
}
```

### MCPListResponse

```typescript
interface MCPListResponse {
  items: MCPItem[]; // Array of MCP server configurations
  currentPage: number; // Current page number
  totalPages: number; // Total number of pages
}
```

### MCPItem

```typescript
interface MCPItem {
  id: string; // Server configuration ID
  name: string; // Server name
  allowedTools: string[]; // Array of allowed tool IDs
  authConfigIds: string[]; // Array of auth configuration IDs
  commands: {
    claude: string; // Claude setup command
    cursor: string; // Cursor setup command
    windsurf: string; // Windsurf setup command
  };
  MCPUrl: string; // Base MCP server URL
  toolkitIcons: Record<string, string>; // Toolkit icons mapping
  serverInstanceCount: number; // Number of active server instances
  toolkits: string[]; // Array of associated toolkit names
}
```

### MCPUpdateParams

```typescript
interface MCPUpdateParams {
  name?: string; // Updated server name
  toolkits?: Array<string | MCPConfigToolkits>; // Updated toolkit configurations
  allowedTools?: string[]; // Updated array of allowed tools
  manuallyManageConnections?: boolean; // Updated connection management setting
}
```

### MCPGetInstanceParams

```typescript
interface MCPGetInstanceParams {
  manuallyManageConnections?: boolean; // Whether to manually manage account connections (default: false)
}
```

## Best Practices

### 1. Configuration Naming

Use descriptive names that indicate the purpose and scope:

```typescript
// Good
await composio.mcp.create(
  "gmail-support-assistant",
  {
    toolkits: [...],
    manuallyManageConnections: false
  }
);

// Avoid
await composio.mcp.create(
  "config1",
  {
    toolkits: [...],
    manuallyManageConnections: false
  }
);
```

### 2. Tool Selection

Be specific about which tools to expose:

```typescript
// Good - specific tools for the use case
const mcpConfig = await composio.mcp.create('email-assistant', {
  toolkits: [{ toolkit: 'gmail', authConfigId: 'ac_gmail' }],
  allowedTools: ['GMAIL_FETCH_EMAILS', 'GMAIL_SEND_EMAIL', 'GMAIL_CREATE_DRAFT'],
  manuallyManageConnections: false,
});

// Avoid - exposing unnecessary tools
const mcpConfig = await composio.mcp.create('email-assistant', {
  toolkits: [{ toolkit: 'gmail', authConfigId: 'ac_gmail' }],
  // No allowedTools specified - exposes all tools
  manuallyManageConnections: false,
});
```

### 3. Authentication Management

Use Composio-managed authentication when possible:

```typescript
// Recommended
const mcpConfig = await composio.mcp.create(
  "server-name",
  {
    toolkits: [...],
    manuallyManageConnections: false  // Let Composio handle auth
  }
);
```

### 4. Error Handling

Always handle potential errors:

```typescript
try {
  const mcpConfig = await composio.mcp.create('server-name', {
    toolkits: serverConfigs,
    manuallyManageConnections: false,
  });

  const serverInstance = await composio.mcp.generate('user123', mcpConfig.id);

  // Use server instance with your MCP client
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

// For Vercel AI MCP clients
await mcpClient.close();
```

### 6. Server Instance Management

Generate server instances per user to maintain proper isolation:

```typescript
// Good - separate instances for different users
const userAInstance = await composio.mcp.generate('userA', mcpConfig.id);
const userBInstance = await composio.mcp.generate('userB', mcpConfig.id);

// Each user gets their own isolated MCP server URL
console.log('User A MCP URL:', userAInstance.url);
console.log('User B MCP URL:', userBInstance.url);
```

### 7. Pagination for Large Lists

Use pagination when listing many MCP configurations:

```typescript
// Good - paginate through results
let currentPage = 1;
let hasMore = true;

while (hasMore) {
  const result = await composio.mcp.list({
    page: currentPage,
    limit: 20
  });
  
  // Process result.items
  console.log(`Page ${currentPage}: ${result.items.length} items`);
  
  hasMore = currentPage < result.totalPages;
  currentPage++;
}
```

## Migration from Deprecated MCP API

If you're using the deprecated MCP API, here's how to migrate:

### Before (Deprecated MCP API)

```typescript
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new AnthropicProvider(),
});

const server = await composio.deprecated.mcp.create(
  'server-name',
  [
    {
      authConfigId: 'ac_config',
      allowedTools: ['GMAIL_FETCH_EMAILS'],
    },
  ],
  { isChatAuth: true }
);

const urls = await server.getServer({
  userId: 'user123',
});
```

### After (Current MCP API)

```typescript
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const mcpConfig = await composio.mcp.create('server-name', {
  toolkits: [{ toolkit: 'gmail', authConfigId: 'ac_config' }],
  allowedTools: ['GMAIL_FETCH_EMAILS'],
  manuallyManageConnections: true, // Equivalent to isChatAuth: true
});

const serverInstance = await composio.mcp.generate('user123', mcpConfig.id);
```

### Key Differences

1. **API Location**: Moved from `composio.deprecated.mcp` to `composio.mcp`
2. **Configuration Structure**: Simplified toolkit configuration with flexible options
3. **Response Format**: Returns `MCPServerInstance` instead of provider-specific formats
4. **Method Names**: `generate()` instead of `getServer()`
5. **Authentication**: `manuallyManageConnections` instead of `isChatAuth`

## Troubleshooting

### Common Issues

1. **Auth config not found**: Verify your auth configuration IDs are correct and exist
   ```typescript
   // Verify auth config exists
   try {
     const authConfig = await composio.authConfigs.get('ac_your_config_id');
     console.log('Auth config found:', authConfig.toolkit);
   } catch (error) {
     console.error('Auth config not found:', error.message);
   }
   ```

2. **Tool not available**: Check that tools are properly configured in your toolkit
   ```typescript
   // List available tools for a toolkit
   const tools = await composio.tools.list({ toolkit: 'gmail' });
   console.log('Available Gmail tools:', tools.map(t => t.slug));
   ```

3. **Connection timeout**: MCP clients need to remain active while tools are being used
   ```typescript
   // Set appropriate timeouts for long-running operations
   const transport = new SSEClientTransport(new URL(serverInstance.url), {
     timeout: 30000 // 30 seconds
   });
   ```

4. **Server instance not found**: Ensure the MCP configuration ID is valid
   ```typescript
   // Verify configuration exists before generating instance
   try {
     const config = await composio.mcp.get(mcpConfigId);
     const instance = await composio.mcp.generate(userId, mcpConfigId);
   } catch (error) {
     console.error('Configuration not found:', error.message);
   }
   ```

5. **Validation errors**: Check that your configuration parameters are correct
   ```typescript
   // Ensure toolkits array is properly formatted
   const mcpConfig = await composio.mcp.create('server-name', {
     toolkits: [
       { toolkit: 'gmail', authConfigId: 'ac_valid_id' }, // Valid format
       'github', // Also valid for default auth
     ],
     allowedTools: ['GMAIL_FETCH_EMAILS'], // Must be valid tool slugs
     manuallyManageConnections: false, // Must be boolean
   });
   ```

### Debug Mode

Enable debug logging to troubleshoot issues:

```typescript
// Set environment variable for debug logging
process.env.COMPOSIO_LOG_LEVEL = 'debug';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

// Additional debugging
console.log('Composio config:', {
  baseURL: composio.config?.baseURL,
  hasApiKey: !!composio.config?.apiKey,
});
```

### Getting Help

If you encounter issues:

1. Check the [Composio documentation](https://docs.composio.dev)
2. Review your auth configurations and connected accounts
3. Verify that your MCP client is compatible with the Server-Sent Events transport
4. Ensure your API key has the necessary permissions

## Conclusion

The MCP API provides a powerful and flexible way to integrate Composio's tools with modern AI frameworks through the Model Control Protocol. Key benefits include:

- **Comprehensive management**: Full CRUD operations for MCP server configurations
- **User isolation**: Generate unique server instances for individual users
- **Flexible authentication**: Choose between Composio-managed or manual account management
- **Universal compatibility**: Works with any MCP-compatible client

By following the patterns and best practices outlined in this documentation, you can build robust and maintainable AI applications that leverage the full power of Composio's tool ecosystem through standardized MCP interfaces.
