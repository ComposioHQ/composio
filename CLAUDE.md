# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the Composio SDK v3 repository containing both TypeScript and Python SDKs. The main development focus is on the TypeScript SDK located in `/ts/` directory. The project uses a monorepo structure with multiple packages and examples.

## Memories and Notes

- For documentation tasks, refer to `fern/CLAUDE.md`

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
- **Build Configs**: `turbo.jsonc`, `tsconfig.base.json`, `tsdown.config.base.ts`
- **E2E Tests**: `ts/e2e-tests/`

## Testing Commands

```bash
# Run all tests
pnpm test

# Run tests for core package only
cd ts/packages/core && pnpm test

# Run tests with UI
pnpm test:ui
```

### TypeScript E2E Tests

E2E tests for `@composio/core` are located in `ts/e2e-tests/` and test runtime compatibility across different JavaScript environments.

```bash
# Run all e2e tests (Node.js + Cloudflare)
pnpm test:e2e

# Run only Node.js e2e tests (CJS/ESM compatibility, runs in Docker)
pnpm test:e2e:node

# Run only Cloudflare Workers e2e tests
pnpm test:e2e:cloudflare

# Run Node.js tests with a specific Node version
COMPOSIO_E2E_NODE_VERSION=22.12.0 pnpm test:e2e:node
```

**E2E Test Structure:**
```
ts/e2e-tests/
├── _utils/                    # Shared Docker infrastructure
├── runtimes/
│   ├── node/                  # Node.js runtime tests
│   │   ├── cjs-basic/         # CommonJS compatibility
│   │   └── esm-basic/         # ESM compatibility
│   └── cloudflare/            # Cloudflare runtime tests
│       └── cf-workers-basic/  # Cloudflare Workers tests
└── README.md                  # E2E test documentation
```

> **Note:** When adding new e2e tests, update `ts/e2e-tests/README.md` with the new test information.

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
    // Implementation
    return {
      data: { result: input.param },
      error: null,
      successful: true
    };
  }
});
```

This monorepo uses pnpm workspaces and Turbo for efficient builds and development.

## Python SDK Development

### Setup
The Python SDK is located in the `/python/` directory and uses `uv` for dependency management and `nox` for automation.

### Environment Setup
```bash
# Create and setup Python development environment
cd python
make env
source .venv/bin/activate
```

### Python Development Commands
```bash
# Setup environment (creates virtual env with all dependencies)
make env

# Sync dependencies (when in an existing environment)
make sync

# Install provider packages
make provider

# Format code using ruff
make fmt
# Or directly: nox -s fmt

# Check linting and type issues
make chk
# Or directly: nox -s chk

# Fix linting issues
nox -s fix

# Run tests (requires implementing tst session)
make tst
# Or directly: nox -s tst

# Run sanity tests (requires implementing snt session)  
make snt
# Or directly: nox -s snt

# Clean build artifacts
make clean-build

# Bump version
make bump

# Build packages
make build
```

### Python Project Structure
```
python/
├── composio/           # Main SDK package
├── providers/          # Provider implementations
├── tests/             # Test suite
├── examples/          # Usage examples
├── scripts/           # Development scripts
├── config/            # Configuration files
│   ├── pytest.ini     # Pytest configuration
│   ├── mypy.ini       # MyPy type checking config
│   ├── ruff.toml     # Ruff linter/formatter config
│   └── codecov.yml   # Code coverage config
├── Makefile          # Development shortcuts
├── noxfile.py        # Nox automation sessions
└── pyproject.toml    # Project configuration
```

### Python Code Quality
- **Formatter**: Ruff (Black-compatible, 88 char line length)
- **Linter**: Ruff with custom configuration
- **Type Checker**: mypy with strict optional typing
- **Test Framework**: pytest with custom markers (core, openai, langchain, agno)
- **Python Version**: >=3.10, <4
- **Dependency Managers**: uv

### Python Testing
```bash
# Run tests with pytest markers
pytest -m core        # Run core tests only
pytest -m openai      # Run OpenAI provider tests
pytest -m langchain   # Run LangChain provider tests
pytest -m agno       # Run Agno provider tests
```

### Python Package Dependencies
- Core: `pysher`, `pydantic>=2.6.4`, `composio-client==1.4.0`, `typing-extensions>=4.0.0`, `openai`
- Dev: `nox`, `pytest`, `ruff`, `langchain_openai`, `fastapi`, `twine`, `click`, `semver`

### Python Environment Variables
Same as TypeScript SDK, with additional:
```bash
OPENAI_API_KEY    # Required for OpenAI provider examples
```