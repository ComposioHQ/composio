# Composio SDK v3

The Composio SDK is a powerful toolkit that enables you to integrate third-party tools and services into your applications. It helps you connect to various services (toolkits), execute tools, and manage user connections seamlessly.

## Features

- Execute tools from various services (GitHub, Gmail, Slack, etc.)
- Manage user connections to external services
- Create custom tools with your own logic
- Integrate with AI providers like OpenAI
- Powerful middleware and modifier support
- Extensive error handling

## Documentation

The SDK is thoroughly documented in the [docs](./docs) directory:

- [Overview](./docs/overview.md) - Introduction and key concepts
- [Getting Started](./docs/getting-started.md) - Quick start guide
- [Core Concepts](./docs/core-concepts.md) - Fundamental SDK concepts
- [Configuration](./docs/internal/configuration.md) - Environment variables and SDK configuration

### API Reference

- [Composio Class](./docs/api/composio.md) - Main SDK class
- [Tools](./docs/api/tools.md) - Using and creating tools
- [Toolkits](./docs/api/toolkits.md) - Working with tool collections
- [Connected Accounts](./docs/api/connected-accounts.md) - User authentication
- [Auth Configs](./docs/api/auth-configs.md) - Authentication configuration
- [Custom Tools](./docs/api/custom-tools.md) - Creating your own tools
- [Providers](./docs/api/providers.md) - AI integration options

### Provider Documentation

- [OpenAI Provider](./docs/providers/openai.md) - Using OpenAI with Composio
- [Google Provider](./docs/providers/google.md) - Using Google GenAI with Composio
- [Custom Providers](./docs/providers/custom.md) - Creating new providers

### Advanced Topics

- [Error Handling](./docs/advanced/error-handling.md) - Managing errors
- [Middleware and Modifiers](./docs/advanced/modifiers.md) - Customizing tools
- [Telemetry](./docs/advanced/telemetry.md) - SDK usage tracking
- [Custom Providers](./docs/advanced/custom-providers.md) - Detailed provider guide

### Internal Documentation

For SDK maintainers and contributors:

- [Configuration and Environment Variables](./docs/internal/configuration.md) - Detailed guide on SDK configuration
- [Triggers Implementation](./docs/internal/triggers.md) - Internal workings of the trigger system

## Installation

```bash
# Using npm
npm install @composio/core

# Using yarn
yarn add @composio/core

# Using pnpm
pnpm add @composio/core
```

## Quick Start

```typescript
import { Composio } from '@composio/core';

// Initialize the SDK
const composio = new Composio({
  apiKey: 'your-api-key',
});

// Get tools from a specific toolkit
const tools = await composio.tools.get('default', {
  toolkits: ['github'],
});

// Get tools with version control
const versionedTools = await composio.tools.get('default', {
  toolkits: ['github'],
  toolkitVersions: { github: '20250909_00' }
});

// Get a specific tool with version
const specificTool = await composio.tools.get('default', 'GITHUB_GET_REPOS', '20250909_00');

// Execute a tool
const result = await composio.tools.execute('GITHUB_GET_REPO', {
  userId: 'default',
  arguments: {
    owner: 'composio',
    repo: 'sdk',
  },
});

console.log(result.data);
```

## OpenAI Integration

```typescript
import { Composio } from '@composio/core';
import OpenAI from 'openai';

// Initialize Composio and OpenAI
const composio = new Composio({
  apiKey: 'your-composio-api-key',
});

const openai = new OpenAI({
  apiKey: 'your-openai-api-key',
});

// Get GitHub tools
const tools = await composio.tools.get('default', {
  toolkits: ['github'],
});

// Get specific version of GitHub tools
const versionedTools = await composio.tools.get('default', {
  toolkits: ['github'],
  toolkitVersions: { github: 'latest' }
});

// Create a chat completion with the tools
const completion = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are a helpful assistant with access to GitHub tools.' },
    { role: 'user', content: 'Find information about the Composio SDK repository' },
  ],
  tools, // Pass the tools to OpenAI
});

// If the model wants to use a tool
if (completion.choices[0].message.tool_calls) {
  const toolCall = completion.choices[0].message.tool_calls[0];
  const args = JSON.parse(toolCall.function.arguments);

  // Execute the tool
  const result = await composio.tools.execute(toolCall.function.name, {
    userId: 'default',
    arguments: args,
  });

  console.log(result.data);
}
```

## Creating Custom Tools

```typescript
import { z } from 'zod';

// Create a custom tool
const customTool = await composio.tools.createCustomTool({
  name: 'Weather Forecast',
  description: 'Get the weather forecast for a location',
  slug: 'WEATHER_FORECAST',
  inputParams: z.object({
    location: z.string().describe('The location to get the forecast for'),
    days: z.number().optional().default(3).describe('Number of days for the forecast')
  }),
  execute: async (input) => {
    try {
      const { location, days = 3 } = input;

      // Your implementation here
      const forecast = [
        { date: '2025-05-21', temperature: 72, conditions: 'Sunny' },
        { date: '2025-05-22', temperature: 68, conditions: 'Partly Cloudy' },
        { date: '2025-05-23', temperature: 65, conditions: 'Rainy' },
      ];

      return {
        data: { forecast },
        successful: true,
        error: null,
      };
    } catch (error) {
      return {
        data: {},
        successful: false,
        error: error.message,
      };
    }
  },
});
```

## Project Structure

```
composio/
├── packages/                  # Main packages directory
│   ├── core/                  # Core SDK package
│   └── providers/             # Provider implementations
├── examples/                  # Example implementations
│   ├── connected-accounts/    # Connected accounts examples
│   ├── langchain/            # LangChain integration examples
│   ├── openai/               # OpenAI integration examples
│   ├── modifiers/            # Modifiers examples
│   ├── toolkits/             # Toolkits examples
│   └── vercel/               # Vercel AI examples
├── docs/                      # Documentation
├── scripts/                   # Development and build scripts
└── .github/                   # GitHub configuration
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

   # Create a new example
   pnpm create:example <example-name>

   # Check peer dependencies
   pnpm check:peer-deps

   # Update peer dependencies
   pnpm update:peer-deps
   ```

## Creating a New Example

1. Use the create:example script:

   ```bash
   pnpm create:example my-example
   ```

2. The script will create a new example in `examples/my-example` with:

   - `package.json` with minimal dependencies (`@composio/core` and `dotenv`)
   - `tsconfig.json` for TypeScript configuration
   - `.env.example` and `.env` files for environment variables
   - `src/index.ts` with basic Composio SDK setup
   - `README.md` with setup and usage instructions
   - Dependencies automatically installed

3. Next steps after creation:
   - Edit `.env` and add your `COMPOSIO_API_KEY`
   - Customize `src/index.ts` with your example logic
   - Add any additional dependencies as needed
   - Run with `pnpm start` or `pnpm dev` (with file watching)

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

For detailed information about both automated and manual release processes, please refer to our [Release Process Documentation](./docs/internal/release.md).

## Environment Variables

- `COMPOSIO_API_KEY`: Your Composio API key
- `COMPOSIO_BASE_URL`: Custom API base URL (optional)
- `COMPOSIO_LOG_LEVEL`: Logging level (silent, error, warn, info, debug)
- `COMPOSIO_DISABLE_TELEMETRY`: Disable telemetry when set to "true"
- `DEVELOPMENT`: Development mode flag
- `CI`: CI environment flag

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for more details.

## License

ISC License

## Support

For support, please visit our [Documentation](./docs) or join our [Discord Community](https://discord.gg/composio).
