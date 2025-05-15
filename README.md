# Composio SDK

The core Composio SDK which allows users to interact with the Composio Platform. It provides a powerful and flexible way to manage and execute tools, handle authentication, and integrate with various platforms and frameworks.

## Project Structure

```
composio/
├── packages/                  # Main packages directory
│   ├── core/                 # Core SDK package
│   │   └── core/            # Core SDK package
│   ├── toolsets/             # Toolset implementations
│   │   ├── openai/          # OpenAI toolset
│   │   ├── vercel/          # Vercel AI toolset
│   │   ├── langchain/       # LangChain toolset
│   │   └── cloudflare/      # Cloudflare toolset
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

   # Create a new toolset
   pnpm create-toolset <toolset-name> [--agentic]

   # Check peer dependencies
   pnpm check:peer-deps

   # Update peer dependencies
   pnpm update:peer-deps
   ```

## Creating a New Toolset

1. Use the create-toolset script:

   ```bash
   pnpm create-toolset my-toolset [--agentic]
   ```

2. The script will create a new toolset in `packages/toolsets/my-toolset` with:

   - Basic toolset implementation
   - TypeScript configuration
   - Package configuration
   - README template

3. Implement the required methods in `src/index.ts`:
   - For non-agentic toolsets: `wrapTool` and `wrapTools`
   - For agentic toolsets: `wrapTool`, `wrapTools`, and execution handlers

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

3. **Publish**
   ```bash
   # This will:
   # 1. Build all packages
   # 2. Check peer dependencies
   # 3. Publish packages to npm
   pnpm run publish
   ```

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

### Toolsets

```bash
# Install OpenAI toolset (included in core)
npm install @composio/openai

# Install Vercel AI toolset
npm install @composio/vercel

# Install Langchain toolset
npm install @composio/langchain
```

## Getting Started

### Basic Usage with OpenAI Toolset

```typescript
import { Composio } from '@composio/core';
import { OpenAIToolset } from '@composio/openai-toolset';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  // OpenAIToolset is the default, so this is optional
  toolset: new OpenAIToolset(),
});

// Fetch a single tool
const searchTool = await composio.tools.get('user123', 'HACKERNEWS_SEARCH_POSTS');

// Fetch multiple tools
const tools = await composio.tools.get('user123', {
  category: 'search',
  limit: 10,
});
```

## Using with a Toolset

### Example with Vercel AI Toolset

```typescript
import { Composio } from '@composio/core';
import { VercelToolset } from '@composio/vercel-toolset';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  toolset: new VercelToolset(),
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
const tool = await composio.tools.get('user123', 'HACKERNEWS_SEARCH_POSTS', {
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

For agentic toolsets (like Vercel AI and Langchain), you can also modify tool execution behavior:

```typescript
const tool = await composio.tools.get('user123', 'HACKERNEWS_SEARCH_POSTS', {
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

### Creating Custom Toolsets

You can create custom toolsets by extending either `BaseNonAgenticToolset` or `BaseAgenticToolset`:

#### Non-Agentic Toolset

```typescript
import { BaseNonAgenticToolset } from '@composio/core';
import type { Tool } from '@composio/core';

interface CustomTool {
  name: string;
  // ... custom tool properties
}

export class CustomToolset extends BaseNonAgenticToolset<CustomTool[], CustomTool> {
  readonly name = 'custom-toolset';

  wrapTool = (tool: Tool): CustomTool => ({
    name: tool.name,
    // ... map other properties
  });

  wrapTools = (tools: Tool[]): CustomTool[] => tools.map(tool => this.wrapTool(tool));
}
```

#### Agentic Toolset

```typescript
import { BaseAgenticToolset } from '@composio/core';
import type { Tool, ToolExecuteParams, ToolExecuteResponse } from '@composio/core';

export class CustomAgenticToolset extends BaseAgenticToolset<CustomTool[], CustomTool> {
  readonly name = 'custom-agentic-toolset';

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

To quickly create a new toolset project, use the provided script:

```bash
# Create a non-agentic toolset
pnpm create-toolset my-toolset

# Create an agentic toolset
pnpm create-toolset my-toolset --agentic
```

## Environment Variables

- `COMPOSIO_API_KEY`: Your Composio API key
- `COMPOSIO_BASE_URL`: Custom API base URL (optional)
- `COMPOSIO_LOGGING_LEVEL`: Logging level (silent, error, warn, info, debug)
- `DEVELOPMENT`: Development mode flag
- `CI`: CI environment flag
