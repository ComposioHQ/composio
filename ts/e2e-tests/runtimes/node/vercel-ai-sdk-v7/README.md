# @composio/vercel + AI SDK v7 Compatibility Test

Verifies that `@composio/vercel` installs, typechecks, and executes wrapped tools with `ai@7`.

## Background

`@composio/vercel` declares `ai` as a peer dependency across multiple majors (`^6.0.0 || ^7.0.0`). This suite guards the AI SDK **v7** arm of that range, including the v7-specific `ToolExecutionOptions` shape passed to `tool.execute`. The v6 arm is covered by the sibling `vercel-ai-sdk-v6` suite.

## What It Tests

| Marker                                          | Description                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `vercel ai sdk compatibility typecheck passed`  | The packed provider typechecks against `ai@7` (`fixtures/index.ts`) |
| `WRAPPED_TOOL_INPUT_SCHEMA_OK`                  | `wrapTool` returns an AI SDK tool with `inputSchema` + `execute`    |
| `OBJECT_INPUT_EXECUTION_OK`                     | Object inputs are forwarded to `executeTool`                        |
| `STRING_INPUT_EXECUTION_OK`                     | JSON-string inputs are normalized before `executeTool`              |
| `V7_EXECUTION_OPTIONS_OK`                       | A wrapped tool accepts AI SDK v7 `ToolExecutionOptions`            |
| `TOOL_SET_OK`                                   | `wrapTools` produces a `ToolSet`-compatible collection             |

## Fixture

```
fixtures/
├── index.mjs      # Executed at runtime: wraps a tool and asserts execution behavior
├── index.ts       # Type-only (tsc --noEmit): asserts the provider's types line up with ai@7
└── package.json   # Declares @composio/core (linked), ai@7, typescript, zod
```

The provider is installed the way consumers get it: `npm pack` of `@composio/vercel`, then install the resulting tarball — so the published `dist` and `peerDependencies` are exercised, not the workspace source.

## Setup

The `setup` phase runs `npm run install:vercel && npm run typecheck` in a Docker volume, then the fixture (`index.mjs`) runs with the installed `node_modules` mounted read-only.

## Isolation Tool

**Docker** with Node.js versions: 22.22.3, 24.17.0, 25.9.0.

## Running

```bash
pnpm test:e2e
```
