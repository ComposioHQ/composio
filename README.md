# @composio/core

The core Composio SDK which allows users to interact with the Composio Platform.

## Core Features

- **Tools**: Manage and execute tools within the Composio ecosystem. Includes functionality to list, retrieve, and execute tools.
- **Toolkits**: Organize and manage collections of tools for specific use cases.
- **Triggers**: Create and manage event triggers that can execute tools based on specific conditions. Includes support for different trigger types and status management.
- **AuthConfigs**: Configure authentication providers and settings. Manage auth configs with features to create, update, enable/disable, and delete configurations.
- **ConnectedAccounts**: Manage third-party service connections. Includes functionality to create, list, refresh, and manage the status of connected accounts.
- **ActionExecution**: Track and manage the execution of actions within the platform.

## Toolsets

Composio SDK supports two types of toolsets:

1. **Non-Agentic Toolsets**: These toolsets only support schema modifiers for transforming tool schemas. They are suitable for simple integrations like OpenAI, Anthropic, etc.
2. **Agentic Toolsets**: These toolsets support full modifier capabilities including tool execution modifiers, schema modifiers, and custom modifiers. They are suitable for more complex integrations like Vercel, Langchain, etc.

## Usage

@composio/core ships with OpenAI toolset by default. You can directly use the tools from composio in `openai` methods.

```typescript
import { Composio } from '@composio/core';

// By default composio ships with OpenAI toolset (non-agentic)
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const tool = await composio.getToolBySlug('HACKERNEWS_SEARCH_POSTS');
console.log(tool);
```

For more examples, please check the `/examples` directory.

## Using with a different toolset

To use a different toolset, please install the recommended toolset packages.

```typescript
import { Composio } from '@composio/core';
import { VercelToolset } from '@composio/vercel-toolset'; // Agentic toolset
// or
import { OpenAIToolset } from '@composio/openai-toolset'; // Non-agentic toolset

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  toolset: new VercelToolset(), // or new OpenAIToolset()
});

const tool = await composio.getToolBySlug('HACKERNEWS_SEARCH_POSTS');
console.log(tool);
```

## Creating a new toolset

To create a new Toolset, you need to extend either `BaseNonAgenticToolset` or `BaseAgenticToolset` from `@composio/core` and implement the required methods.

To quickly create a toolset project, execute the following command from the root of the project:

```bash
# Create a non-agentic toolset (default)
pnpm run create-toolset <your-toolset-name>

# Create an agentic toolset
pnpm run create-toolset <your-toolset-name> --agentic
```

For example:

```bash
# Create a non-agentic toolset for Anthropic
pnpm run create-toolset anthropic

# Create an agentic toolset for Langchain
pnpm run create-toolset langchain --agentic
```

The script will create a new toolset with the following structure:

```
<toolset-name>/
├── src/
│   └── index.ts      # Toolset implementation
├── package.json      # Package configuration
├── tsconfig.json     # TypeScript configuration
├── tsup.config.ts    # Build configuration
└── README.md         # Toolset documentation
```

## Internal

What's not included from @composio/client

- [x] Org/Project Mangement with API Keys
- [x] Trigger Subscriptions
- [ ] Zod Schemas for type checking `Ideally strike a minimal balance, since backend has most`
- [ ] Action Execution
- [ ] CLI `Do we need this in the core SDK?`
- [ ] MCP `Not required as this is not necessary`
- [ ] Team Members
- [ ] File uploads/user files
- [ ] Tests

These models can be still be accessed via the SDK explicitly by using the `@composio/client`.
