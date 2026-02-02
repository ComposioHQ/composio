# OpenAI + Zod v4 Compatibility Test

Verifies that `@composio/core` works correctly with `openai` and `zod@4`.

## Background

Issue [#2336](https://github.com/ComposioHQ/composio/issues/2336) reported peer dependency conflicts for users with `zod@4`.

## What It Tests

| Test                | Description                                           |
| ------------------- | ----------------------------------------------------- |
| npm install         | Installs `@composio/core`, `openai`, and `zod@4`      |
| Package integration | Verifies all packages work together without conflicts |
| wrapTool            | Confirms OpenAI provider tool wrapping works          |

## Fixture

```
fixtures/
├── index.mjs      # Test script that imports and uses all packages
└── package.json   # Declares dependencies: @composio/core, openai@^6.16.0, zod@^4.3.5
```

The fixture uses `usesFixtures: true` with a setup phase to install dependencies at runtime:

- `package.json` declares `@composio/core` (linked from monorepo), `openai`, and `zod@4`
- `index.mjs` imports all three packages and verifies they work together
- Tests `wrapTool` to ensure schema conversion works with Zod v4

## Setup

The `setup` phase runs `npm install --legacy-peer-deps` in a Docker volume, then the fixture runs with the installed `node_modules` mounted read-only.

## Isolation Tool

**Docker** with Node.js versions: 20.19.0, 22.12.0.

## Running

```bash
pnpm test:e2e
```
