# Composio TypeScript workspace

This directory contains the TypeScript half of the Composio SDK monorepo: the core SDK, provider adapters, the CLI, examples, and end-to-end tests. For an overview of Composio itself, start at the [root README](../README.md) and [docs.composio.dev](https://docs.composio.dev).

If you just want to use the SDK:

```bash
npm install @composio/core
```

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

const session = await composio.sessions.create('user_123');
const tools = await session.tools();
```

See the [`@composio/core` README](packages/core/README.md) and the [quickstart](https://docs.composio.dev/docs/quickstart) for the full flow, including provider setup for your agent framework.

## Packages

Published packages:

| Package | Description |
|---------|-------------|
| [`@composio/core`](packages/core) | The Composio SDK. Ships its TypeScript source and SDK docs so installed copies are inspectable by coding agents. |
| [`@composio/slim`](packages/slim) | Same API as `@composio/core` without the packaged source and docs; smaller install. |
| [`composio` CLI](packages/cli) | Standalone CLI binary: search, execute, and script tools from your shell. |
| [`@composio/*` providers](packages/providers) | Adapters that format Composio tools for agent frameworks (OpenAI, Anthropic, Vercel AI SDK, LangChain, and more). See the [provider table](../README.md#providers). |
| [`@composio/experimental`](packages/experimental) | Experimental integrations, currently the Pi provider. |
| [`@composio/json-schema-to-zod`](packages/json-schema-to-zod) | JSON Schema to Zod conversion. |

Internal (unpublished) packages: `cli-keyring` and `cli-local-tools` support the CLI; `ts-builders` generates TypeScript source.

## Layout

```text
ts/
  packages/        Published and internal packages (see above)
  examples/        Runnable examples per feature and framework
  e2e-tests/       Runtime E2E tests (Node, Deno, Cloudflare Workers, CLI)
  docs/            Workspace SDK docs: API notes and internal guides
  scripts/         Build, validation, and scaffolding scripts
  vendor/          Read-only reference submodules; do not edit
```

## Development

Commands run from the repository root. Install the pinned toolchain first:

```bash
mise install
pnpm install
```

Build and verify:

```bash
pnpm build:packages   # build all TS packages
pnpm typecheck        # typecheck all TS packages
pnpm lint:packages    # eslint over ts/packages
pnpm test             # package unit tests plus example validation
```

Runtime E2E suites (require credentials):

```bash
pnpm test:e2e:node
pnpm test:e2e:deno
pnpm test:e2e:cloudflare
pnpm test:e2e:cli
```

Scaffolding:

```bash
pnpm create:provider <name> [--agentic]   # new provider package
pnpm create:example <name>                # new example under ts/examples
```

Changesets are required for changes to published packages; see the [contribution guidelines](../CONTRIBUTING.md).

## Support

- [Documentation](https://docs.composio.dev)
- [Discord community](https://discord.gg/composio)
- [Open an issue](https://github.com/ComposioHQ/composio/issues)
