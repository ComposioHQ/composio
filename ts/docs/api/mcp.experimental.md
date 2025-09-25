# MCP Experimental API

The Experimental MCP (Model Control Protocol) API provides advanced server management capabilities for creating, configuring, and managing MCP servers with enhanced features.

## Overview

The ExperimentalMCP class offers comprehensive CRUD operations for MCP servers, including:

- Creating custom MCP configurations with toolkit-specific settings
- Listing and filtering servers with pagination
- Retrieving detailed server information
- Updating server configurations
- Deleting servers
- Managing server instances for users

## Getting Started

```typescript
import { Composio } from '@composio/core';

const composio = new Composio();
const userId = "xxx-oooo-xxx";

// create an MCP Server Config
const server = await composio.experimental.mcp.create('my-mcp-server', {
  toolkits: [
    {
      toolkit: 'slack',
      authConfigId: 'ac_12324343',
      allowedTools: ['SLACK_SEND_MESSAGE'],
    },
  ],
});

// get an instance for a user
const mcp = await server.generate(userId);

// using the global api
const mcp = await composio.mcp.generate(userId, server.id);

/** mcp
 * {
 *   ...
 *   id: "serverid",
 *   url: "mcp-server.com/mcp",
 *   ...
 * }
 * /

// use the mcp with your mcp-client
```

## Methods

### create(name, config)

Creates a new MCP server configuration with specified toolkits and authentication settings.

**Parameters:**

- `name` (string): Unique name for the MCP configuration
- `config` (MCPConfigCreationParams): Configuration object containing:
  - `toolkits` (Array): Array of toolkit configurations
    - `toolkit` (string, optional): Toolkit identifier (e.g., "github", "slack")
    - `authConfigId` (string, optional): Auth configuration ID
    - `allowedTools` (string[], optional): Specific tools to enable
  - `manuallyManageConnections` (boolean, optional): Whether to manually manage account connections (default: false)

**Returns:** `Promise<MCPConfigCreateResponse>`

**Example:**

```typescript
const server = await composio.experimental.mcp.create('personal-mcp-server', {
  toolkits: [
    {
      toolkit: 'github',
      authConfigId: 'ac_xyz',
      allowedTools: ['GITHUB_CREATE_ISSUE', 'GITHUB_LIST_REPOS'],
    },
    {
      toolkit: 'slack',
      authConfigId: 'ac_abc',
      allowedTools: ['SLACK_SEND_MESSAGE'],
    },
  ],
  manuallyManageConnections: false,
});

// Get server instance for a user
const mcp = await server.generate('user_12345');
```

### list(options)

Lists MCP servers with optional filtering and pagination.

**Parameters:**

- `options` (MCPListParams): Filtering and pagination options
  - `page` (number, optional): Page number for pagination (default: 1)
  - `limit` (number, optional): Maximum items per page (default: 10)
  - `toolkits` (string[], optional): Filter by toolkit names
  - `authConfigs` (string[], optional): Filter by auth configuration IDs
  - `name` (string, optional): Filter by server name (partial match)

**Returns:** `Promise<MCPListResponse>`

**Example:**

```typescript
// List all servers
const allServers = await composio.experimental.mcp.list({});

// Paginated listing
const pagedServers = await composio.experimental.mcp.list({
  page: 2,
  limit: 5,
});

// Filter by toolkit
const githubServers = await composio.experimental.mcp.list({
  toolkits: ['github', 'slack'],
});

// Filter by name
const personalServers = await composio.experimental.mcp.list({
  name: 'personal',
});
```

### get(serverId)

Retrieves detailed information about a specific MCP server/config.

**Parameters:**

- `serverId` (string): The unique identifier of the MCP server/config

**Returns:** `Promise<MCPItem>`

**Example:**

```typescript
const server = await composio.experimental.mcp.get('mcp_12345');

console.log(server.name); // "My Personal MCP Server"
console.log(server.allowedTools); // ["GITHUB_CREATE_ISSUE", "SLACK_SEND_MESSAGE"]
console.log(server.toolkits); // ["github", "slack"]
console.log(server.serverInstanceCount); // 3

// Access setup commands for different clients
console.log(server.commands.claude); // Claude setup command
console.log(server.commands.cursor); // Cursor setup command
console.log(server.commands.windsurf); // Windsurf setup command
```

### update(serverId, config)

Updates an existing MCP server configuration.

**Parameters:**

- `serverId` (string): The unique identifier of the MCP server to update
- `config` (MCPUpdateParams): Update configuration parameters
  - `name` (string, optional): New server name
  - `toolkits` (Array, optional): Updated toolkit configurations
  - `manuallyManageConnections` (boolean, optional): Connection management setting

**Returns:** `Promise<MCPItem>`

**Example:**

```typescript
// Update server name only
const updatedServer = await composio.experimental.mcp.update('mcp_12345', {
  name: 'My Updated MCP Server',
});

// Update toolkits and tools
const serverWithNewTools = await composio.experimental.mcp.update('mcp_12345', {
  toolkits: [
    {
      toolkit: 'github',
      authConfigId: 'auth_abc123',
      allowedTools: ['GITHUB_CREATE_ISSUE', 'GITHUB_LIST_REPOS'],
    },
    {
      toolkit: 'slack',
      authConfigId: 'auth_xyz789',
      allowedTools: ['SLACK_SEND_MESSAGE', 'SLACK_LIST_CHANNELS'],
    },
  ],
});

// Complete update
const fullyUpdatedServer = await composio.experimental.mcp.update('mcp_12345', {
  name: 'Production MCP Server',
  toolkits: [
    {
      toolkit: 'gmail',
      authConfigId: 'auth_gmail_prod',
      allowedTools: ['GMAIL_SEND_EMAIL', 'GMAIL_FETCH_EMAILS'],
    },
  ],
  manuallyManageConnections: false,
});
```

### delete(serverId)

Permanently deletes an MCP server configuration.

**Parameters:**

- `serverId` (string): The unique identifier of the MCP server to delete

**Returns:** `Promise<{id: string; deleted: boolean}>`

**Example:**

```typescript
// Delete a server
const result = await composio.experimental.mcp.delete('mcp_12345');

if (result.deleted) {
  console.log(`Server ${result.id} has been successfully deleted`);
} else {
  console.log(`Failed to delete server ${result.id}`);
}

// With error handling
try {
  const result = await composio.experimental.mcp.delete('mcp_12345');
  console.log('Deletion successful:', result);
} catch (error) {
  console.error('Failed to delete MCP server:', error.message);
}

// Verify deletion
await composio.experimental.mcp.delete('mcp_12345');
const servers = await composio.experimental.mcp.list({});
const serverExists = servers.items.some(server => server.id === 'mcp_12345');
console.log('Server still exists:', serverExists); // Should be false
```

### generate(userId, mcpConfigId, options?)

Creates a server instance for a specific user.

**Parameters:**

- `userId` (string): External user ID from your database
- `mcpConfigId` (string): MCP configuration ID
- `options` (MCPGetInstanceParams, optional): Additional options
  - `manuallyManageConnections` (boolean, optional): Whether to manually manage connections

**Returns:** `Promise<MCPServerInstance>`

**Example:**

```typescript
const mcp = await composio.experimental.mcp.generate('user_12345', 'mcp_67890', {
  manuallyManageConnections: false,
});

console.log(mcp.url); // Server URL for the user
console.log(mcp.allowedTools); // Available tools
```

## Data Types

### MCPItem

Complete MCP server information including:

- `id`: Unique server identifier
- `name`: Human-readable server name
- `allowedTools`: Array of enabled tool identifiers
- `authConfigIds`: Array of auth configuration IDs
- `toolkits`: Array of toolkit names
- `commands`: Setup commands for different clients (Claude, Cursor, Windsurf)
- `MCPUrl`: Server connection URL
- `toolkitIcons`: Map of toolkit icons
- `serverInstanceCount`: Number of active instances

### MCPListResponse

Paginated list response containing:

- `items`: Array of MCPItem objects
- `currentPage`: Current page number
- `totalPages`: Total number of pages

### MCPServerInstance

User-specific server instance containing:

- `id`: Server identifier
- `name`: Server name
- `type`: Connection type (always 'streamable_http')
- `url`: User-specific connection URL
- `userId`: Associated user ID
- `allowedTools`: Available tools for the user
- `authConfigs`: Associated auth configurations

## Error Handling

All methods can throw the following exceptions:

- **ValidationError**: When input parameters are invalid or malformed
- **Error**: When API operations fail (server not found, network issues, etc.)

### Example Error Handling

```typescript
try {
  const server = await composio.experimental.mcp.create('test-server', config);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid configuration:', error.message);
  } else {
    console.error('API error:', error.message);
  }
}
```

## Best Practices

### 1. Server Naming

Use descriptive, unique names for your MCP servers:

```typescript
// Good
'production-github-slack-server';
'dev-testing-environment';
'user-personal-tools';

// Avoid
'server1';
'test';
'mcp';
```

### 2. Toolkit Configuration

Be specific about allowed tools to maintain security:

```typescript
// Specific tools (recommended)
{
  toolkit: "github",
  allowedTools: ["GITHUB_CREATE_ISSUE", "GITHUB_LIST_REPOS"]
}

// Avoid allowing all tools unless necessary
{
  toolkit: "github"
  // No allowedTools = all tools enabled
}
```

### 3. Connection Management

Choose the appropriate connection management strategy:

```typescript
// For chat based agents
{
  manuallyManageConnections: false;
}

// For background agents, where you have to pre connect all the accounts
{
  manuallyManageConnections: true;
}
```

### 4. Pagination

Use pagination for large server lists:

```typescript
let page = 1;
let allServers = [];

while (true) {
  const response = await composio.experimental.mcp.list({
    page,
    limit: 50,
  });

  allServers.push(...response.items);

  if (page >= response.totalPages) break;
  page++;
}
```

## Limitations
- Toolkit updates replace the entire configuration (no merging)
- Deleted servers cannot be recovered
- Server instances are tied to specific user IDs

## Support

For issues with the Experimental MCP API:

1. Check the error message for validation issues
2. Verify your server configurations are valid
3. Ensure you have proper permissions for the requested operations
4. Contact support with specific error details and reproduction steps
