# OpenAI + Zod v4 Compatibility Test

Verifies that `@composio/core` works correctly with `openai` and `zod@4`.

## Background

Issue [#2336](https://github.com/ComposioHQ/composio/issues/2336) reported peer dependency conflicts for users with `zod@4`.

## What It Tests

| Test                | Description                                            |
| ------------------- | ------------------------------------------------------ |
| npm install         | Installs `@composio/core`, `openai`, and `zod@4`       |
| Package integration | Verifies all packages work together without conflicts  |
| wrapTool            | Confirms OpenAI provider tool wrapping works           |

## Isolation Tool

**Docker** with Node.js versions: 20.19.0, 22.12.0

This ensures tests run against exact Node.js versions independent of the developer's local setup.

## Running

```bash
pnpm test:e2e
```
