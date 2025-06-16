# @composio/core

The core Composio SDK which allows users to interact with the Composio Platform. It provides a powerful and flexible way to manage and execute tools, handle authentication, and integrate with various platforms and frameworks.

## Core Features

- **Tools**: Manage and execute tools within the Composio ecosystem. Includes functionality to list, retrieve, and execute tools.
- **Toolkits**: Organize and manage collections of tools for specific use cases.
- **Triggers**: Create and manage event triggers that can execute tools based on specific conditions.
- **AuthConfigs**: Configure authentication providers and settings.
- **ConnectedAccounts**: Manage third-party service connections.
- **ActionExecution**: Track and manage the execution of actions within the platform.

## Installation

```bash
npm install @composio/core
# or
yarn add @composio/core
# or
pnpm add @composio/core
```

## Getting Started

### Basic Usage with OpenAI Provider

```typescript
import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  // OpenAIProvider is the default, so this is optional
  provider: new OpenAIProvider(),
});

// Fetch a single tool by slig
const tools = await composio.tools.get('user123', 'HACKERNEWS_SEARCH_POSTS');

// Fetch multiple tools
const tools = await composio.tools.get('user123', {
  category: 'search',
  limit: 10,
});
```

## Configuration

The Composio constructor accepts the following configuration options:

```typescript
interface ComposioConfig {
  apiKey?: string; // Your Composio API key
  baseURL?: string; // Custom API base URL (optional)
  allowTracking?: boolean; // Enable/disable telemetry (default: true)
  allowTracing?: boolean; // Enable/disable tracing (default: true)
  provider?: TProvider; // Custom provider (default: OpenAIProvider)
  host?: string; // Name of the host service which is using the SDK, this is for telemetry.
}
```

## Modifiers

Composio SDK supports powerful modifiers to transform tool schemas and execution behavior.

### Schema Modifiers

Schema modifiers allow you to transform tool schemas before they are used:

```typescript
const tools = await composio.tools.get('user123', 'HACKERNEWS_SEARCH_POSTS', {
  modifySchema: (toolSlug: string, toolkitSlug: string, tool: Tool) => ({
    ...tool,
    description: 'Enhanced HackerNews search with additional features',
    inputParameters: {
      ...tool.inputParameters,
      limit: {
        type: 'number',
        description: 'Maximum number of posts to return',
        default: 10,
      },
    },
  }),
});
```

### Execution Modifiers

For agentic providers (like Vercel AI and Langchain), you can also modify tool execution behavior:

```typescript
const tools = await composio.tools.get('user123', 'HACKERNEWS_SEARCH_POSTS', {
  // Transform input before execution
  beforeExecute: (toolSlug: string, toolkitSlug: string, params: ToolExecuteParams) => ({
    ...params,
    arguments: {
      ...params.arguments,
      limit: Math.min((params.arguments?.limit as number) || 10, 100),
    },
  }),

  // Transform output after execution
  afterExecute: (toolSlug: string, toolkitSlug: string, response: ToolExecuteResponse) => ({
    ...response,
    data: {
      ...response.data,
      posts: (response.data?.posts as any[]).map(post => ({
        ...post,
        url: post.url || `https://news.ycombinator.com/item?id=${post.id}`,
      })),
    },
  }),
});
```

## Connected Accounts

Composio SDK provides a powerful way to manage third-party service connections through Connected Accounts. This feature allows you to authenticate with various services and maintain those connections.

### Creating a Connected Account

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

// Create a connected account
const connectionRequest = await composio.createConnectedAccount(
  'user123', // userId
  'HACKERNEWS', // authConfigId
  {
    redirectUrl: 'https://your-app.com/callback',
    data: {
      // Additional data for the connection
      scope: ['read', 'write'],
    },
  }
);

// Wait for the connection to be established
// Default timeout is 60 seconds
const connectedAccount = await connectionRequest.waitForConnection();
```

### Waiting for Connection Establishment

The `waitForConnection` method is available on both the `ConnectionRequest` and `ConnectedAccounts` classes. It allows you to poll for a connection to become active:

```typescript
// From a ConnectionRequest instance (returned by createConnectedAccount)
const connectedAccount = await connectionRequest.waitForConnection(120000); // 2 minute timeout

// From the ConnectedAccounts class (using a connected account ID)
const connectedAccount = await composio.connectedAccounts.waitForConnection('conn_abc123', 60000); // 1 minute timeout
```

The method continuously polls the Composio API until the connection:

- Becomes `ACTIVE` (returns the connected account)
- Enters a terminal state like `FAILED`, `EXPIRED`, or `DELETED` (throws an error)
- Exceeds the specified timeout (throws a timeout error)

If the connection does not complete within the provided timeout (default: 60 seconds), a `ConnectionRequestTimeoutError` is thrown.

### Managing Connected Accounts

```typescript
// List all connected accounts
const accounts = await composio.connectedAccounts.list({
  userId: 'user123',
});

// Get a specific connected account
const account = await composio.connectedAccounts.get('account_id');

// Enable/Disable a connected account
await composio.connectedAccounts.enable('account_id');
await composio.connectedAccounts.disable('account_id');

// Refresh credentials
await composio.connectedAccounts.refresh('account_id');

// Delete a connected account
await composio.connectedAccounts.delete('account_id');
```

### Connection Statuses

Connected accounts can have the following statuses:

- `ACTIVE`: Connection is established and working
- `INACTIVE`: Connection is temporarily disabled
- `PENDING`: Connection is being processed
- `INITIATED`: Connection request has started
- `EXPIRED`: Connection credentials have expired
- `FAILED`: Connection attempt failed

### Authentication Schemes

Composio supports various authentication schemes:

- OAuth2
- OAuth1
- OAuth1a
- API Key
- Basic Auth
- Bearer Token
- Google Service Account
- And more...

## Environment Variables

- `COMPOSIO_API_KEY`: Your Composio API key
- `COMPOSIO_BASE_URL`: Custom API base URL
- `COMPOSIO_LOGGING_LEVEL`: Logging level (silent, error, warn, info, debug)
- `DEVELOPMENT`: Development mode flag
- `CI`: CI environment flag

## Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).
