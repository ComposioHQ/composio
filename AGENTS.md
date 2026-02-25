# AGENTS.md

This file provides guidance to AI coding agents (Codex, Claude Code, etc.) when working with code in this repository.

## Overview

This is the Composio SDK v3 repository containing both TypeScript and Python SDKs. The main development focus is on the TypeScript SDK located in `/ts/` directory. The project uses a monorepo structure with multiple packages and examples.

## Notes

- For documentation tasks, refer to `docs/CLAUDE.md`
- Vendor submodules in `ts/vendor/` are **read-only reference only** — do not modify them

## Common Development Commands

### Build and Development
```bash
pnpm build              # Build all packages
pnpm build:packages     # Build only TypeScript packages
pnpm clean              # Clean build artifacts
pnpm lint               # Lint code
pnpm lint:fix           # Lint and auto-fix
pnpm format             # Format code
pnpm test               # Run tests
```

### Package Management
```bash
pnpm install            # Install dependencies
pnpm check:peer-deps    # Check peer dependencies
pnpm update:peer-deps   # Update peer dependencies
```

### Creating New Components
```bash
pnpm create:provider <provider-name> [--agentic]
pnpm create:example <example-name>
```

### Release Management
```bash
pnpm changeset            # Create changeset for releases
pnpm changeset:version    # Version packages
pnpm changeset:release    # Publish packages
```

## Project Architecture

### Repository Structure
```
composio/
├── ts/                      # TypeScript SDK (main development)
│   ├── packages/
│   │   ├── core/           # Core SDK functionality
│   │   ├── providers/      # AI provider integrations (OpenAI, Anthropic, etc.)
│   │   ├── cli/           # Command-line interface (Effect.ts + @clack/prompts)
│   │   ├── json-schema-to-zod/ # Schema conversion utility
│   │   └── ts-builders/   # TypeScript code generation utilities
│   ├── vendor/            # Read-only reference submodules (Effect, Clack)
│   └── examples/          # Usage examples for different providers
├── python/                # Python SDK
├── docs/                  # Documentation (Fumadocs)
└── examples/              # Cross-platform examples
```

### Core Packages

**@composio/core** — Main SDK functionality:
- `src/composio.ts` — Main Composio class
- `src/models/` — Core models (Tools, Toolkits, ConnectedAccounts, etc.)
- `src/provider/` — Base provider implementations
- `src/services/` — Internal services (telemetry, pusher)
- `src/types/` — TypeScript type definitions
- `src/utils/` — Utility functions and helpers

**Provider Packages** — AI integrations:
- `@composio/openai`, `@composio/anthropic`, `@composio/google`
- `@composio/langchain`, `@composio/vercel`, `@composio/mastra`

### Key Concepts

- **Tools** — Individual functions (e.g., GITHUB_CREATE_REPO, GMAIL_SEND_EMAIL)
- **Toolkits** — Collections of related tools grouped by service (github, gmail, slack)
- **Connected Accounts** — User authentication/authorization for external services
- **Auth Configs** — Configuration for different authentication methods
- **Custom Tools** — User-defined tools with custom logic
- **Providers** — Integrations with AI frameworks (OpenAI, Anthropic, etc.)
- **Modifiers** — Middleware to transform tool inputs/outputs

## Development Workflow

### Testing
- Unit tests use **Vitest** — run with `pnpm test`
- Tests are in `test/` directories within each package
- Mock implementations in `test/utils/mocks/`

### Code Quality
- **ESLint** — config in `eslint.config.mjs`
- **Prettier** — for code formatting
- **TypeScript** — strict mode enabled
- **Husky** — pre-commit hooks for quality checks

### TypeScript E2E Tests
```bash
pnpm test:e2e              # All (Node.js + Deno + Cloudflare)
pnpm test:e2e:node         # Node.js CJS/ESM compatibility (Docker)
pnpm test:e2e:deno         # Deno npm: specifier compatibility (Docker)
pnpm test:e2e:cloudflare   # Cloudflare Workers
```

## Environment Variables

```bash
COMPOSIO_API_KEY            # Required: Your Composio API key
COMPOSIO_BASE_URL           # Optional: Custom API base URL
COMPOSIO_LOG_LEVEL          # Optional: silent, error, warn, info, debug
COMPOSIO_DISABLE_TELEMETRY  # Optional: Set to "true" to disable telemetry
```

## Key Files and Locations

- **Main SDK Entry**: `ts/packages/core/src/index.ts`
- **Core Composio Class**: `ts/packages/core/src/composio.ts`
- **Type Definitions**: `ts/packages/core/src/types/`
- **Error Classes**: `ts/packages/core/src/errors/`
- **Documentation**: `docs/`
- **Build Configs**: `turbo.jsonc`, `tsconfig.base.json`, `tsdown.config.base.ts`

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
import { z } from 'zod';

const customTool = await composio.tools.createCustomTool({
  name: 'My Tool',
  description: 'Tool description',
  slug: 'MY_TOOL',
  inputParams: z.object({
    param: z.string().describe('Parameter description')
  }),
  execute: async (input) => {
    return {
      data: { result: input.param },
      error: null,
      successful: true
    };
  }
});
```

## Python SDK Development

### Setup
```bash
cd python
make env                 # Create virtual env with all dependencies
source .venv/bin/activate
```

### Commands
```bash
make fmt       # Format code (ruff)
make chk       # Check linting and type issues
make tst       # Run tests
make snt       # Run sanity tests
make build     # Build packages
```

### Code Quality
- **Formatter**: Ruff (Black-compatible, 88 char line length)
- **Linter**: Ruff
- **Type Checker**: mypy with strict optional typing
- **Test Framework**: pytest with markers (core, openai, langchain, agno)
- **Python Version**: >=3.10, <4

## Maintenance Tasks

### When Updating GitHub Actions

Update the "Prerequisites" section in `ts/docs/internal/release.md` with current tool versions:

- **Node.js**: `cat .nvmrc`
- **Bun**: `cat .bun-version`
- **pnpm**: `cat package.json | jq -r .packageManager | cut -d'@' -f2`

This monorepo uses pnpm workspaces and Turbo for efficient builds and development.
