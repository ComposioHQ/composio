# Core Concepts

Composio SDK is built around a set of key concepts that work together to provide a seamless integration experience for third-party services and tools.

## User IDs

User IDs are the **core foundation** of accessing and executing tools in Composio. Every tool execution, connection authorization, and account management operation requires a `userId` parameter that identifies which user's context the operation should be performed in.

### ⚠️ Critical Security Considerations

User IDs are crucial for security and data isolation. You must be extremely careful when handling user IDs to ensure:

- Users can only access their own connected accounts
- Tool executions are performed in the correct user context
- No unauthorized access to other users' data

### The `default` User ID

The `default` userId refers to the default account of your Composio project and should **only be used for**:

- **Testing and development** environments
- **Single-user applications** where external users don't connect their own accounts
- **Internal tools** where all operations are performed by your system

```typescript
// ❌ Don't use 'default' in production for multi-user apps
const tools = await composio.tools.get('default', {
  toolkits: ['github'],
});

// ❌ This could expose other users' data
const result = await composio.tools.execute('GITHUB_GET_REPO', {
  userId: 'default',
  arguments: { owner: 'example', repo: 'repo' },
});
```

### Production User IDs

In production applications with multiple users, always use unique identifiers for each user. The best practices are:

#### ✅ **Recommended: Database UUID**

```typescript
// Use your database's user ID (UUID, primary key, etc.)
const userId = user.id; // e.g., "550e8400-e29b-41d4-a716-446655440000"

const tools = await composio.tools.get(userId, {
  toolkits: ['github'],
});

const result = await composio.tools.execute('GITHUB_GET_REPO', {
  userId: userId,
  arguments: { owner: 'example', repo: 'repo' },
});
```

#### ✅ **Acceptable: Unique Username/Identifier**

```typescript
// Use a unique, stable identifier from your system
const userId = user.username; // e.g., "john_doe_123"
// or
const userId = user.externalId; // e.g., "auth0|507f1f77bcf86cd799439011"
```

#### ⚠️ **Not Recommended: Email Address**

```typescript
// While functional, emails can change and may cause issues
const userId = user.email; // e.g., "user@example.com"
```

### Organization-Based Applications

For **multi-user applications** where users are part of an organization and apps are connected at the **organization level** (not individual user level), use the **organization ID** as the `userId`:

#### When to Use Organization IDs

- **Team/Organization tools**: Apps like Slack, Microsoft Teams, or project management tools where the entire organization shares connections
- **Enterprise applications**: Where IT administrators connect apps for the whole organization
- **Shared resources**: When multiple users need access to the same connected accounts (shared Gmail account, company GitHub org, etc.)
- **Role-based access**: Where permissions are managed at the organization level

#### ✅ **Recommended: Organization ID Pattern**

```typescript
// Use the organization/team/workspace ID
const userId = organization.id; // e.g., "org_550e8400-e29b-41d4-a716-446655440000"
// or
const userId = `org_${organization.slug}`; // e.g., "org_acme-corp"

// All users in the organization share the same connected accounts
const tools = await composio.tools.get(userId, {
  toolkits: ['slack', 'github'],
});

// Execute tools in the organization context
const result = await composio.tools.execute('SLACK_SEND_MESSAGE', {
  userId: userId, // organization ID
  arguments: {
    channel: '#general',
    text: 'Hello from the team!',
  },
});
```

#### Example: Organization-Based Application

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

// 1. Admin connects Slack for the entire organization
async function connectOrganizationToSlack(organizationId: string, adminUserId: string) {
  // Use organization ID as userId in Composio
  const connectionRequest = await composio.toolkits.authorize(organizationId, 'slack');

  // Store the connection request for the admin to complete
  await storeConnectionRequest(organizationId, adminUserId, connectionRequest);

  return connectionRequest.redirectUrl;
}

// 2. Any user in the organization can use the connected tools
async function sendSlackMessage(organizationId: string, channel: string, message: string) {
  return await composio.tools.execute('SLACK_SEND_MESSAGE', {
    userId: organizationId, // organization ID, not individual user ID
    arguments: {
      channel: channel,
      text: message,
    },
  });
}

// 3. Check if organization has required connections
async function getOrganizationTools(organizationId: string) {
  return await composio.tools.get(organizationId, {
    toolkits: ['slack', 'github', 'jira'],
  });
}

// Usage in your API endpoint
app.post('/api/slack/message', async (req, res) => {
  const { channel, message } = req.body;
  const organizationId = req.user.organizationId; // Get from your auth system

  // Verify user has permission to send messages for this organization
  if (!(await userCanSendMessages(req.user.id, organizationId))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  try {
    const result = await sendSlackMessage(organizationId, channel, message);
    res.json(result.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});
```

#### Organization vs Individual User Pattern

```typescript
// ❌ Wrong: Using individual user IDs when apps are connected at org level
const userTools = await composio.tools.get(req.user.id, {
  toolkits: ['slack'], // This would fail if Slack is connected to the org, not the user
});

// ✅ Correct: Using organization ID for org-level connections
const orgTools = await composio.tools.get(req.user.organizationId, {
  toolkits: ['slack'], // This works because Slack is connected to the organization
});

// ✅ Hybrid: Some tools at user level, some at org level
const userPersonalTools = await composio.tools.get(req.user.id, {
  toolkits: ['gmail'], // User's personal Gmail
});

const orgSharedTools = await composio.tools.get(req.user.organizationId, {
  toolkits: ['slack', 'jira'], // Organization's shared tools
});
```

### Example: Multi-User Application Flow

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

// 1. User initiates GitHub connection
async function connectUserToGitHub(userId: string) {
  const connectionRequest = await composio.toolkits.authorize(userId, 'github');
  return connectionRequest.redirectUrl;
}

// 2. Get user's connected GitHub tools
async function getUserGitHubTools(userId: string) {
  return await composio.tools.get(userId, {
    toolkits: ['github'],
  });
}

// 3. Execute tool for specific user
async function getUserRepos(userId: string) {
  return await composio.tools.execute('GITHUB_LIST_REPOS', {
    userId: userId,
    arguments: {
      per_page: 10,
    },
  });
}

// Usage in your API endpoint
app.get('/api/github/repos', async (req, res) => {
  const userId = req.user.id; // Get from your auth system

  try {
    const repos = await getUserRepos(userId);
    res.json(repos.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch repos' });
  }
});
```

### Best Practices

1. **Always validate user IDs** before passing them to Composio methods
2. **Use your authentication system** to ensure users can only access their own data
3. **Keep user IDs consistent** across your application and Composio
4. **Never expose user IDs** in client-side code or logs
5. **Use meaningful, stable identifiers** that won't change over time

## Tools

Tools are the fundamental units of functionality in Composio. Each tool represents a specific action that can be performed, such as "Get GitHub Repository" or "Send Email". Tools have:

- **Slug**: A unique identifier (e.g., `GITHUB_GET_REPO`)
- **Name**: A human-readable name (e.g., "Get GitHub Repository")
- **Description**: A description of what the tool does
- **Input Parameters**: The arguments required to execute the tool
- **Output Parameters**: The data returned by the tool

Tools are organized into toolkits and can be executed through the Composio SDK.

```typescript
// Example: Execute a GitHub tool
const result = await composio.tools.execute('GITHUB_GET_REPO', {
  userId: 'default',
  arguments: {
    owner: 'composio',
    repo: 'sdk',
  },
});
```

## Toolkits

Toolkits are collections of related tools grouped by service or functionality. For example, the "GitHub" toolkit includes tools for interacting with repositories, issues, pull requests, and more.

Toolkits typically require authentication to be accessed, which is managed through connected accounts.

```typescript
// Example: Get all tools from the GitHub toolkit
const tools = await composio.tools.get('default', {
  toolkits: ['github'],
});
```

## Connected Accounts

Connected Accounts represent a user's connection to an external service (toolkit). They store authentication tokens and other information needed to access the service.

The SDK provides methods to create, manage, and use connected accounts:

```typescript
// Example: Initiate a connection to GitHub
const connectionRequest = await composio.toolkits.authorize('user123', 'github');

// Example: Wait for the connection to be established
const connectedAccount = await composio.connectedAccounts.waitForConnection(connectionRequest.id);
```

## Auth Configs

Auth Configs define how authentication works for a particular toolkit. They specify the auth scheme (OAuth2, API Key, etc.) and other authentication-related details.

Auth Configs are usually created automatically when authorizing a toolkit but can also be created manually.

```typescript
// Example: Create an auth config for GitHub
const authConfig = await composio.authConfigs.create('github', {
  type: 'use_composio_managed_auth',
  name: 'GitHub Auth Config',
});
```

## Providers

Providers are adapters that allow tools to be used with different AI platforms or frameworks. The default provider is OpenAIProvider, which formats tools for use with OpenAI's API.

Providers handle the transformation of tools into the format required by the AI platform and manage the execution flow.

```typescript
// Example: Initialize Composio with OpenAI provider
const composio = new Composio({
  apiKey: 'your-api-key',
  provider: new OpenAIProvider(),
});
```

## MCP (Model Control Protocol)

MCP is a standardized protocol for exposing tools and capabilities to AI models. It acts as a bridge between AI agents and external services, providing secure and managed access to tools through MCP servers.

### What is MCP?

Model Control Protocol (MCP) is designed to solve the challenge of connecting AI models to external tools in a secure, scalable way. Instead of directly integrating tools into AI models, MCP provides:

- **Standardized Communication**: A common protocol that different AI frameworks can understand
- **Security Isolation**: Tools run in separate MCP servers, isolating them from the AI model
- **Dynamic Tool Discovery**: AI models can discover available tools at runtime
- **Provider Flexibility**: Works with multiple AI frameworks through provider adapters

### MCP Servers

MCP servers are the core component that expose tools to AI models. Each server:

- **Hosts specific toolkits**: You choose which toolkits and tools to expose
- **Manages authentication**: Handles auth for the tools it exposes
- **Provides secure URLs**: Generates URLs that AI agents can connect to
- **Supports multiple connections**: Can serve multiple users or AI agents

```typescript
// Example: Create an MCP server
const mcpServer = await composio.mcp.create(
  "email-assistant",
  [
    {
      toolkit: "gmail",
      authConfigId: "ac_gmail123",
      allowedTools: ["GMAIL_FETCH_EMAILS", "GMAIL_SEND_EMAIL"]
    }
  ],
  { useComposioManagedAuth: true }
);

// Get server URLs for AI agent to connect
const serverUrls = await mcpServer.getServer({
  connectedAccountIds: { gmail: "connected_account_id" }
});
```

### MCP vs Direct Tool Execution

There are two ways to use tools in Composio:

1. **Direct Execution** (Traditional approach):
   ```typescript
   // Directly execute tools through the SDK
   const result = await composio.tools.execute('GITHUB_GET_REPO', {
     userId: 'user123',
     arguments: { owner: 'example', repo: 'repo' }
   });
   ```

2. **MCP Protocol** (Recommended for AI agents):
   ```typescript
   // Create MCP server and let AI agent discover/execute tools
   const server = await composio.mcp.create("github-server", [...]);
   const urls = await server.getServer({...});
   // AI agent connects to URLs and executes tools autonomously
   ```

### When to Use MCP

Use MCP when:
- Building AI agents that need tool access
- Working with frameworks that support MCP (Claude, Mastra, etc.)
- You want standardized tool discovery and execution
- Security isolation between AI and tools is important
- You need to expose tools to multiple AI agents

Use direct execution when:
- Building traditional applications without AI
- You need fine-grained control over tool execution
- Working with simple scripts or automation
- MCP overhead isn't necessary

## Custom Tools

Custom Tools allow you to extend Composio's functionality by creating your own tools. You define the input and output parameters and provide a handler function that implements the tool's behavior.

```typescript
// Example: Create a custom tool
const customTool = await composio.tools.createCustomTool({
  name: 'My Custom Tool',
  description: 'A custom tool that does something specific',
  slug: 'MY_CUSTOM_TOOL',
  inputParameters: {
    param1: {
      type: 'string',
      description: 'First parameter',
      required: true,
    },
  },
  outputParameters: {
    result: {
      type: 'string',
      description: 'The result of the operation',
    },
  },
  handler: async (params, context) => {
    // Custom logic here
    return { data: { result: 'Success!' } };
  },
});
```

## Triggers

Triggers allow your application to respond to events from external services. They define when and how your application should take action based on external events.

```typescript
// Example: Get available triggers
const triggers = await composio.triggers.get({
  toolkits: ['github'],
});
```
