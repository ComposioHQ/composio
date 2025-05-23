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
