# Composio SDK

The core Composio SDK which allows users to interact with the Composio Platform. It provides a powerful and flexible way to manage and execute tools, handle authentication, and integrate with various platforms and frameworks.

## Project Structure

```
composio/
├── packages/                  # Main packages directory
│   ├── core/                 # Core SDK package
│   │   └── core/            # Core SDK package
│   ├── providers/             # Provider implementations
│   │   ├── openai/          # OpenAI provider
│   │   ├── vercel/          # Vercel AI provider
│   │   ├── langchain/       # LangChain provider
│   │   └── cloudflare/      # Cloudflare provider
│   └── wrappers/            # Runtime-specific wrappers
├── examples/                 # Example implementations
│   ├── langchain/           # LangChain example
│   ├── openai/              # OpenAI example
│   ├── pre-processors/      # Pre-processors example
│   └── vercel/              # Vercel AI example
├── scripts/                  # Development and build scripts
└── .github/                  # GitHub configuration
```

## Development Setup

1. **Prerequisites**

   - Node.js (Latest LTS version recommended)
   - [pnpm](https://pnpm.io/) (v10.8.0 or later)
   - [bun](https://bun.sh) for productivity (optional)

2. **Clone and Install**

   ```bash
   git clone https://github.com/ComposioHQ/sdk-v3-ts.git
   cd composio
   pnpm install
   ```

3. **Build**

   ```bash
   pnpm build
   ```

4. **Development Commands**

   ```bash
   # Lint code
   pnpm lint

   # Fix linting issues
   pnpm lint:fix

   # Format code
   pnpm format

   # Create a new provider
   pnpm create:provider <provider-name> [--agentic]

   # Check peer dependencies
   pnpm check:peer-deps

   # Update peer dependencies
   pnpm update:peer-deps
   ```

## Creating a New Provider

1. Use the create:provider script:

   ```bash
   pnpm create:provider my-provider [--agentic]
   ```

2. The script will create a new provider in `packages/providers/my-provider` with:

   - Basic provider implementation
   - TypeScript configuration
   - Package configuration
   - README template

3. Implement the required methods in `src/index.ts`:
   - For non-agentic providers: `wrapTool` and `wrapTools`
   - For agentic providers: `wrapTool`, `wrapTools`, and execution handlers

## Release Process

1. **Prepare for Release**

   - Ensure all changes are committed
   - Run tests and checks:
     ```bash
     pnpm build
     pnpm check:peer-deps
     ```

2. **Create Changeset**

   ```bash
   pnpm changeset
   ```

   - Follow the prompts to describe your changes
   - Commit the generated changeset file
   - if you want to do a pre release, execute the command `pnpm changeset:pre-enter` before the above command

3. **Version**

   ```bash
   pnpm changeset:version
   ```

   - Follow the prompts to version the packages
   - Commit the generated package bumps

4. **Release**

```bash
pnpm changeset:release
```

- Follow the instructions to release the packages

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](https://docs.composio.dev) or join our [Discord Community](https://discord.gg/composio).

## Core Features

- **Tools**: Manage and execute tools within the Composio ecosystem. Includes functionality to list, retrieve, and execute tools.
- **Toolkits**: Organize and manage collections of tools for specific use cases.
- **Triggers**: Create and manage event triggers that can execute tools based on specific conditions.
- **AuthConfigs**: Configure authentication providers and settings.
- **ConnectedAccounts**: Manage third-party service connections.
- **ActionExecution**: Track and manage the execution of actions within the platform.

## Installation

### Core SDK

```bash
npm install @composio/core
# or
yarn add @composio/core
# or
pnpm add @composio/core
```

### Providers

```bash
# Install OpenAI provider (included in core)
npm install @composio/openai

# Install Vercel AI provider
npm install @composio/vercel

# Install Langchain provider
npm install @composio/langchain
```

## Getting Started

### Basic Usage with OpenAI Provider

```typescript
import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai-provider';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  // OpenAIProvider is the default, so this is optional
  provider: new OpenAIProvider(),
});

// Fetch a single tool by it's slug
const tools = await composio.tools.get('user123', 'HACKERNEWS_SEARCH_POSTS');

// Fetch multiple tools
const tools = await composio.tools.get('user123', {
  category: 'search',
  limit: 10,
});
```

## Using with a Provider

### Example with Vercel AI Provider

```typescript
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel-provider';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

// Fetch tools for Vercel AI SDK
const tools = await composio.tools.get('user123', {
  category: 'search',
});

// Use tools with Vercel AI SDK
const completion = await ai.chat({
  messages: [{ role: 'user', content: 'Search for posts about React' }],
  tools: tools,
});
```

## Modifiers

Composio SDK supports powerful modifiers to transform tool schemas and execution behavior.

### Schema Modifiers

Schema modifiers allow you to transform tool schemas before they are used:

```typescript
const tools = await composio.tools.get('user123', 'HACKERNEWS_SEARCH_POSTS', {
  modifyToolSchema: (toolSlug: string, tool: Tool) => ({
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
  beforeToolExecute: (toolSlug: string, params: ToolExecuteParams) => ({
    ...params,
    arguments: {
      ...params.arguments,
      limit: Math.min((params.arguments?.limit as number) || 10, 100),
    },
  }),

  // Transform output after execution
  afterToolExecute: (toolSlug: string, response: ToolExecuteResponse) => ({
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
  'id-of-auth-config', // authConfigId
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

### Waiting for Connection to be Established

The SDK provides a convenient way to wait for a connection to be established using the `waitForConnection` method:

```typescript
// From a ConnectionRequest instance (after creating a connected account)
// With default timeout (60 seconds)
const connectedAccount = await connectionRequest.waitForConnection();

// With custom timeout (2 minutes)
const connectedAccount = await connectionRequest.waitForConnection(120000);

// Directly from the ConnectedAccounts class (with an existing connected account ID)
const connectedAccount = await composio.connectedAccounts.waitForConnection('conn_abc123', 60000);
```

The method polls the Composio API until:

- The connection becomes `ACTIVE` (returns the connected account)
- The connection enters a terminal state (`FAILED`, `EXPIRED`, `DELETED`) and throws an error
- The timeout is exceeded (throws a timeout error)

This is particularly useful for OAuth flows where the user needs to authorize the connection in a browser.

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

## Development

### Creating Custom Providers

You can create custom providers by extending either `BaseNonAgenticProvider` or `BaseAgenticProvider`:

#### Non-Agentic Provider

```typescript
import { BaseNonAgenticProvider } from '@composio/core';
import type { Tool } from '@composio/core';

interface CustomTool {
  name: string;
  // ... custom tool properties
}

export class CustomProvider extends BaseNonAgenticProvider<CustomTool[], CustomTool> {
  readonly name = 'custom-provider';

  wrapTool = (tool: Tool): CustomTool => ({
    name: tool.name,
    // ... map other properties
  });

  wrapTools = (tools: Tool[]): CustomTool[] => tools.map(tool => this.wrapTool(tool));
}
```

#### Agentic Provider

```typescript
import { BaseAgenticProvider } from '@composio/core';
import type { Tool, ToolExecuteParams, ToolExecuteResponse } from '@composio/core';

export class CustomAgenticProvider extends BaseAgenticProvider<CustomTool[], CustomTool> {
  readonly name = 'custom-agentic-provider';

  wrapTool = (tool: Tool): CustomTool => ({
    name: tool.name,
    // ... map other properties
  });

  wrapTools = (tools: Tool[]): CustomTool[] => tools.map(tool => this.wrapTool(tool));

  async executeToolCall(
    userId: string,
    tool: { name: string; arguments: unknown },
    options: pppppp,
    modifiers?: ExecuteToolModifiers
  ): Promise<string> {
    const result = await this.executeTool(
      tool.name,
      {
        arguments: tool.arguments,
        userId,
        ...options,
      },
      modifiers
    );
    return JSON.stringify(result);
  }
}
```

To quickly create a new provider project, use the provided script:

```bash
# Create a non-agentic provider
pnpm create:provider my-provider

# Create an agentic provider
pnpm create:provider my-provider --agentic
```

## Environment Variables

- `COMPOSIO_API_KEY`: Your Composio API key
- `COMPOSIO_BASE_URL`: Custom API base URL (optional)
- `COMPOSIO_LOGGING_LEVEL`: Logging level (silent, error, warn, info, debug)
- `DEVELOPMENT`: Development mode flag
- `CI`: CI environment flag
