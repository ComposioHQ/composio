# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the Composio SDK v3 repository containing both TypeScript and Python SDKs. The main development focus is on the TypeScript SDK located in `/ts/` directory. The project uses a monorepo structure with multiple packages and examples.

## Common Development Commands

### Build and Development
```bash
# Build all packages
pnpm build

# Build only TypeScript packages  
pnpm build:packages

# Clean build artifacts
pnpm clean
pnpm clean:workspace

# Lint code
pnpm lint
pnpm lint:fix

# Format code
pnpm format

# Run tests
pnpm test
```

### Package Management
```bash
# Install dependencies
pnpm install

# Check peer dependencies
pnpm check:peer-deps

# Update peer dependencies  
pnpm update:peer-deps
```

### Creating New Components
```bash
# Create a new provider
pnpm create:provider <provider-name> [--agentic]

# Create a new example
pnpm create:example <example-name>
```

### Release Management
```bash
# Create changeset for releases
pnpm changeset

# Version packages
pnpm changeset:version

# Publish packages
pnpm changeset:release
```

## Project Architecture

### Repository Structure
```
composio/
├── ts/                      # TypeScript SDK (main development)
│   ├── packages/
│   │   ├── core/           # Core SDK functionality
│   │   ├── providers/      # AI provider integrations (OpenAI, Anthropic, etc.)
│   │   ├── cli/           # Command-line interface
│   │   ├── json-schema-to-zod/ # Schema conversion utility
│   │   └── ts-builders/   # TypeScript code generation utilities
│   └── examples/          # Usage examples for different providers
├── python/                # Python SDK
├── fern/                  # Documentation and API specs
└── examples/              # Cross-platform examples
```

### Core Packages

**@composio/core** - Main SDK functionality:
- `src/composio.ts` - Main Composio class
- `src/models/` - Core models (Tools, Toolkits, ConnectedAccounts, etc.)
- `src/provider/` - Base provider implementations
- `src/services/` - Internal services (telemetry, pusher)
- `src/types/` - TypeScript type definitions
- `src/utils/` - Utility functions and helpers

**Provider Packages** - AI integrations:
- `@composio/openai` - OpenAI integration
- `@composio/anthropic` - Anthropic integration
- `@composio/google` - Google GenAI integration
- `@composio/langchain` - LangChain integration
- `@composio/vercel` - Vercel AI integration
- `@composio/mastra` - Mastra integration

### Key Concepts

**Tools** - Individual functions that can be executed (e.g., GITHUB_CREATE_REPO, GMAIL_SEND_EMAIL)

**Toolkits** - Collections of related tools grouped by service (e.g., github, gmail, slack)

**Connected Accounts** - User authentication/authorization for external services

**Auth Configs** - Configuration for different authentication methods

**Custom Tools** - User-defined tools with custom logic

**Providers** - Integrations with AI frameworks (OpenAI, Anthropic, etc.)

**Modifiers** - Middleware to transform tool inputs/outputs

## Development Workflow

### For Tool Development
1. Tools are auto-generated from OpenAPI specifications
2. Custom tools can be created using the Custom Tools API
3. Tool execution happens through the main Composio class

### For Provider Development
1. Use `pnpm create:provider <name>` to scaffold new providers
2. Implement required methods: `wrapTool`, `wrapTools`
3. For agentic providers, also implement execution handlers
4. Add comprehensive tests and documentation

### Testing
- Unit tests use Vitest
- Run tests with `pnpm test`
- Tests are located in `test/` directories within each package
- Mock implementations are available in `test/utils/mocks/`

### Code Quality
- ESLint configuration in `eslint.config.mjs`
- Prettier for code formatting
- TypeScript strict mode enabled
- Comprehensive TSDoc documentation required
- Husky pre-commit hooks for quality checks

## Environment Variables

```bash
COMPOSIO_API_KEY          # Required: Your Composio API key
COMPOSIO_BASE_URL         # Optional: Custom API base URL
COMPOSIO_LOG_LEVEL        # Optional: Logging level (silent, error, warn, info, debug)
COMPOSIO_DISABLE_TELEMETRY # Optional: Set to "true" to disable telemetry
DEVELOPMENT               # Development mode flag
CI                       # CI environment flag
```

## Key Files and Locations

- **Main SDK Entry**: `ts/packages/core/src/index.ts`
- **Core Composio Class**: `ts/packages/core/src/composio.ts`
- **Type Definitions**: `ts/packages/core/src/types/`
- **Error Classes**: `ts/packages/core/src/errors/`
- **Examples**: `ts/examples/` and `examples/`
- **Documentation**: `ts/docs/` and `fern/`
- **Build Configs**: `turbo.json`, `tsconfig.base.json`

## Testing Commands

```bash
# Run all tests
pnpm test

# Run tests for core package only
cd ts/packages/core && pnpm test

# Run tests with UI
pnpm test:ui
```

## Common Patterns

### Tool Execution
```typescript
const composio = new Composio({ apiKey: 'your-key' });
const result = await composio.tools.execute('TOOL_NAME', {
  userId: 'user-id',
  arguments: { /* tool args */ }
});
```

### Provider Integration
```typescript
import { OpenAIProvider } from '@composio/openai';
const provider = new OpenAIProvider({ apiKey: 'openai-key' });
const tools = await composio.tools.get('user-id', { toolkits: ['github'] });
const wrappedTools = provider.wrapTools(tools);
```

### Custom Tool Creation
```typescript
const customTool = await composio.tools.createCustomTool({
  name: 'My Tool',
  description: 'Tool description',
  inputParameters: { /* JSON schema */ },
  handler: async (params) => { /* implementation */ }
});
```

This monorepo uses pnpm workspaces and Turbo for efficient builds and development.