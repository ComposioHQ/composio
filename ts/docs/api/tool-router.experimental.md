# ToolRouter Experimental API

The ToolRouter Experimental API provides a powerful way to create isolated sessions for testing and managing tool routing logic with scoped access to multiple toolkits. This lab feature allows you to dynamically configure which tools are available within a session and manage their authentication configurations.

## Overview

The ToolRouter class enables you to:

- Create isolated sessions with specific toolkit configurations
- Manage authentication for multiple toolkits in a single session
- Provide scoped MCP server access for testing and development
- Route tool calls efficiently across different services

## Getting Started

```typescript
import { Composio } from '@composio/core';

const composio = new Composio();
const userId = "xxx-ooo-xxx";

// Access the experimental ToolRouter
const mcpSession = composio.experimental.toolRouter.createSession(userId, {
  const toolkits: [{
    toolkit: "github",
    authConfigId: "ac_233434343"
  }]
});
```

## Methods

### createSession(userId, routerConfig)

Creates a new isolated session for the tool router with specified toolkits and authentication configurations.

**Parameters:**

- `userId` (string): Unique user identifier for the session owner
- `routerConfig` (ToolRouterConfig): Configuration object containing:
  - `toolkits` (Array): Array of toolkit configurations
    - `toolkit` (string): Toolkit identifier (e.g., "gmail", "slack", "github")
    - `authConfigId` (string, optional): Specific auth configuration ID for this toolkit
  - `manuallyManageConnections` (boolean, optional): Whether to disable Composio's automatic account management tools (default: false)

**Returns:** `Promise<ToolRouterSession>`

**Example:**

```typescript
// Basic session with multiple toolkits
const session = await composio.experimental.toolRouter.createSession('user_123456789', {
  toolkits: [
    {
      toolkit: 'gmail',
      authConfigId: 'auth_config_123',
    },
    {
      toolkit: 'slack',
      authConfigId: 'auth_config_456',
    },
    {
      toolkit: 'github',
      // No authConfigId - will use default auth
    },
    {
      toolkit: 'hackernews',
      // Public API - no auth needed
    },
  ],
});

console.log('Session ID:', session.sessionId);
console.log('MCP URL:', session.url);

// Session with manual connection management
const manualSession = await composio.experimental.toolRouter.createSession('user_789', {
  toolkits: [
    {
      toolkit: 'slack',
      authConfigId: 'ac_custom_slack',
    },
  ],
  manuallyManageConnections: true,
});

// Use the session URL with your MCP client
const mcpClient = new MCPClient(session.url);
```

## Data Types

### ToolRouterConfig

Configuration object for creating a tool router session:

```typescript
interface ToolRouterConfig {
  toolkits: ToolRouterToolkitConfig[];
  manuallyManageConnections?: boolean; // Disables automatic account management tools
}
```

### ToolRouterToolkitConfig

Individual toolkit configuration within a router config:

```typescript
interface ToolRouterToolkitConfig {
  toolkit: string; // Toolkit identifier
  authConfigId?: string; // Optional auth configuration ID
}
```

### ToolRouterSession

Response object containing session details:

```typescript
interface ToolRouterSession {
  sessionId: string; // Generated session identifier
  url: string; // MCP server endpoint URL for this session
}
```

## Usage Patterns

### 1. Multi-Service Integration

Create sessions that span multiple services for complex workflows:

```typescript
const integrationSession = await composio.experimental.toolRouter.createSession('user_456', {
  toolkits: [
    { toolkit: 'gmail', authConfigId: 'gmail_work' },
    { toolkit: 'slack', authConfigId: 'slack_team' },
    { toolkit: 'github', authConfigId: 'github_personal' },
    { toolkit: 'notion', authConfigId: 'notion_workspace' },
    { toolkit: 'calendar', authConfigId: 'gcal_primary' },
  ],
});

// This session can now handle tools from all configured services
```

### 2. Development and Testing

Create isolated environments for testing different tool combinations:

```typescript
const testSession = await composio.experimental.toolRouter.createSession('test_user', {
  toolkits: [
    { toolkit: 'hackernews' }, // Public API for testing
    { toolkit: 'weatherapi' }, // Weather data
    { toolkit: 'calculator' }, // Built-in tools
  ],
});

// Perfect for testing tool routing logic without auth complexity
```

### 3. User-Specific Sessions

Create personalized sessions with user-specific auth configurations:

```typescript
async function createUserSession(userId: string, userPreferences: any) {
  const userToolkits = [];

  if (userPreferences.email) {
    userToolkits.push({
      toolkit: 'gmail',
      authConfigId: `gmail_${userId}`,
    });
  }

  if (userPreferences.messaging) {
    userToolkits.push({
      toolkit: 'slack',
      authConfigId: `slack_${userId}`,
    });
  }

  if (userPreferences.coding) {
    userToolkits.push({
      toolkit: 'github',
      authConfigId: `github_${userId}`,
    });
  }

  return await composio.experimental.toolRouter.createSession(userId, {
    toolkits: userToolkits,
    manuallyManageConnections: false,
  });
}
```

### 4. Scoped Access Sessions

Create sessions with limited toolkit access for security:

```typescript
const limitedSession = await composio.experimental.toolRouter.createSession('restricted_user', {
  toolkits: [
    { toolkit: 'hackernews' }, // Read-only public data
    { toolkit: 'calculator' }, // Safe computational tools
    { toolkit: 'timer' }, // Utility tools
  ],
  manuallyManageConnections: true, // Extra security layer
});
```

## Connection Management

The `manuallyManageConnections` flag controls whether Composio automatically injects account management tools into your session.

### Automatic Account Management (Default)

When `manuallyManageConnections` is `false` or omitted, Composio injects helpful account management tools:

```typescript
const autoSession = await composio.experimental.toolRouter.createSession('user_123', {
  toolkits: [
    { toolkit: 'gmail', authConfigId: 'gmail_config' },
    { toolkit: 'slack', authConfigId: 'slack_config' },
  ],
  // manuallyManageConnections defaults to false
});

// Composio automatically provides these account management tools:
// 1. Connection status checking tools - agents can verify if accounts are connected
// 2. Connection URL generation tools - agents can prompt users to connect accounts
// 3. Account linking helpers - streamlined authentication flows

// Example: Agent can check connection status
const connectionStatus = await agent.callTool('composio_check_connection_status', {
  toolkit: 'gmail',
  userId: 'user_123',
});

// Example: Agent can generate connection URL for user
const connectionUrl = await agent.callTool('composio_generate_connection_url', {
  toolkit: 'slack',
  authConfigId: 'slack_config',
  userId: 'user_123',
});
```

### Manual Connection Management

When `manuallyManageConnections` is `true`, Composio disables automatic account management tools:

```typescript
const manualSession = await composio.experimental.toolRouter.createSession('user_123', {
  toolkits: [
    { toolkit: 'gmail', authConfigId: 'gmail_config' },
    { toolkit: 'slack', authConfigId: 'slack_config' },
  ],
  manuallyManageConnections: true,
});

// No account management tools are injected
// You must manually ensure all required connections exist beforehand
// Use the Composio SDK to pre-connect accounts:

// Before creating the session, link accounts manually:
await composio.connectedAccounts.link({
  userId: 'user_123',
  authConfigId: 'gmail_config',
});

await composio.connectedAccounts.link({
  userId: 'user_123',
  authConfigId: 'slack_config',
});

// Now the session can use these pre-connected accounts
// But agents cannot dynamically check status or prompt for new connections
```

### When to Use Each Approach

**Use Automatic Account Management (`manuallyManageConnections: false`) when:**

- Building interactive AI agents that can communicate with users
- Creating chat-based applications where users can be prompted to connect accounts
- Developing applications where connection status might change during runtime
- You want agents to handle authentication flows dynamically

**Use Manual Connection Management (`manuallyManageConnections: true`) when:**

- Building automated background processes or workflows
- Creating production systems where all connections are pre-configured
- You need predictable behavior without user interaction
- Security requirements mandate pre-approved connections only
- Building server-side applications without user interface

```typescript
// Interactive AI Assistant - use automatic management
const assistantSession = await toolRouter.createSession('user_456', {
  toolkits: [
    { toolkit: 'gmail', authConfigId: 'user_gmail' },
    { toolkit: 'calendar', authConfigId: 'user_calendar' },
  ],
  manuallyManageConnections: false, // Agent can prompt for connections
});

// Background Automation - use manual management
const automationSession = await toolRouter.createSession('automation_service', {
  toolkits: [
    { toolkit: 'gmail', authConfigId: 'service_gmail' },
    { toolkit: 'sheets', authConfigId: 'service_sheets' },
  ],
  manuallyManageConnections: true, // Pre-configured connections only
});
```

## Integration with MCP Clients

The ToolRouter sessions are designed to work seamlessly with MCP (Model Control Protocol) clients:

```typescript
// Create a session
const session = await composio.experimental.toolRouter.createSession('user_456', {
  toolkits: [{ toolkit: 'gmail' }, { toolkit: 'slack' }, { toolkit: 'github' }],
});

// Use with Claude Desktop
// Add to claude_desktop_config.json:
/*
{
  "mcpServers": {
    "composio-session": {
      "command": "npx",
      "args": ["@composio/core", "mcp"],
      "env": {
        "COMPOSIO_MCP_URL": session.url
      }
    }
  }
}
*/

// Use with custom MCP client
import { MCPClient } from 'your-mcp-client';

const mcpClient = new MCPClient({
  serverUrl: session.url,
  sessionId: session.sessionId,
});

await mcpClient.connect();

// Now you can use tools from all configured toolkits
const emails = await mcpClient.callTool('gmail_fetch_emails', { limit: 10 });
const channels = await mcpClient.callTool('slack_list_channels', {});
const repos = await mcpClient.callTool('github_list_repos', { user: 'username' });
```

## Error Handling

Handle common errors when creating sessions:

```typescript
try {
  const session = await composio.experimental.toolRouter.createSession(userId, config);
  console.log('Session created successfully:', session.sessionId);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid configuration:', error.message);
    // Handle validation errors (malformed config, missing required fields)
  } else if (error.message.includes('auth_config')) {
    console.error('Authentication configuration error:', error.message);
    // Handle auth config issues (invalid IDs, permissions)
  } else if (error.message.includes('toolkit')) {
    console.error('Toolkit configuration error:', error.message);
    // Handle toolkit issues (unsupported toolkit, invalid name)
  } else {
    console.error('Unexpected error:', error.message);
    // Handle other API errors
  }
}
```

## Best Practices

### 1. Session Naming and Organization

Use descriptive user IDs and maintain session records:

```typescript
// Good: Descriptive user identifiers
const session = await toolRouter.createSession('user_john_doe_workspace_1', config);

// Keep track of active sessions
const activeSessions = new Map();
activeSessions.set(userId, session);
```

### 2. Toolkit Selection

Be intentional about which toolkits to include:

```typescript
// Good: Only include necessary toolkits
const focusedSession = await toolRouter.createSession(userId, {
  toolkits: [
    { toolkit: 'gmail' }, // For email operations
    { toolkit: 'calendar' }, // For scheduling
  ],
});

// Avoid: Including unnecessary toolkits
// This creates security risks and complexity
```

### 3. Auth Configuration Management

Use specific auth configs for different contexts:

```typescript
// Production session
const prodSession = await toolRouter.createSession(userId, {
  toolkits: [
    { toolkit: 'gmail', authConfigId: 'gmail_prod_config' },
    { toolkit: 'slack', authConfigId: 'slack_prod_workspace' },
  ],
});

// Development session
const devSession = await toolRouter.createSession(userId, {
  toolkits: [
    { toolkit: 'gmail', authConfigId: 'gmail_dev_config' },
    { toolkit: 'slack', authConfigId: 'slack_dev_workspace' },
  ],
});
```

### 4. Session Lifecycle Management

Implement proper session cleanup:

```typescript
class SessionManager {
  private sessions = new Map<string, ToolRouterSession>();

  async createUserSession(userId: string, config: ToolRouterConfig) {
    // Clean up existing session if any
    if (this.sessions.has(userId)) {
      await this.cleanupSession(userId);
    }

    const session = await toolRouter.createSession(userId, config);
    this.sessions.set(userId, session);

    // Set cleanup timer (optional)
    setTimeout(() => this.cleanupSession(userId), 24 * 60 * 60 * 1000); // 24 hours

    return session;
  }

  async cleanupSession(userId: string) {
    // Implement session cleanup logic
    this.sessions.delete(userId);
  }
}
```

## Use Cases

### 1. AI Assistant Integration

Create dynamic sessions for AI assistants that need access to multiple services:

```typescript
const assistantSession = await toolRouter.createSession('assistant_user_123', {
  toolkits: [
    { toolkit: 'gmail', authConfigId: 'user_email' },
    { toolkit: 'calendar', authConfigId: 'user_calendar' },
    { toolkit: 'slack', authConfigId: 'user_slack' },
    { toolkit: 'github', authConfigId: 'user_github' },
  ],
});

// AI can now help with email, scheduling, team communication, and code
```

### 2. Workflow Automation

Set up sessions for automated workflows:

```typescript
const workflowSession = await toolRouter.createSession('workflow_engine', {
  toolkits: [
    { toolkit: 'gmail' },
    { toolkit: 'slack' },
    { toolkit: 'sheets' },
    { toolkit: 'notion' },
  ],
  manuallyManageConnections: true, // Pre-configured connections
});

// Automated workflow can process emails, update spreadsheets, notify teams
```

### 3. Customer Support Tools

Create specialized sessions for support agents:

```typescript
const supportSession = await toolRouter.createSession(`support_agent_${agentId}`, {
  toolkits: [
    { toolkit: 'zendesk', authConfigId: 'support_zendesk' },
    { toolkit: 'slack', authConfigId: 'support_slack' },
    { toolkit: 'gmail', authConfigId: 'support_email' },
    { toolkit: 'sheets', authConfigId: 'support_tracking' },
  ],
});

// Support agents can access tickets, communicate with team, send emails, track metrics
```

## Limitations and Considerations

- **Session Isolation**: Each session is isolated and cannot directly communicate with other sessions
- **Resource Limits**: There may be limits on the number of concurrent sessions per user
- **Auth Config Requirements**: Some toolkits require specific auth configurations to function properly
- **Session Persistence**: Sessions may have time limits and need to be refreshed periodically
- **Toolkit Compatibility**: Not all toolkit combinations may work optimally together

## Migration and Compatibility

The ToolRouter experimental API is designed to complement existing Composio features:

```typescript
// Can be used alongside regular MCP servers
const regularMCP = await composio.mcp.create('regular-server', serverConfig, options);
const routerSession = await composio.experimental.toolRouter.createSession(userId, routerConfig);

// Both can coexist and serve different purposes
```

## Support and Troubleshooting

For issues with the ToolRouter Experimental API:

1. **Validation Errors**: Check that all required fields are provided and toolkit names are correct
2. **Auth Configuration Issues**: Verify that auth config IDs exist and have proper permissions
3. **Connection Problems**: Ensure network connectivity and proper MCP client configuration
4. **Toolkit Compatibility**: Some toolkits may have specific requirements or limitations

For additional support, consult the Composio documentation or contact support with session details and error messages.
