# OpenAI v6 + Zod v4 Compatibility Test

Verifies that `@composio/core` works correctly with `openai@6` and `zod@4`.

## Background

Issue [#2336](https://github.com/ComposioHQ/composio/issues/2336) reported that `@composio/core` depended on `openai@5`, which only supported `zod@3`. This caused peer dependency conflicts for users with `zod@4`.

The fix upgraded `openai` to v6, which supports `zod@4`.

## What It Tests

The test (`test-peer-deps.mjs`) simulates a fresh user installation:

- Creates an isolated temp directory from `fixtures/`
- Runs `npm install` with `@composio/core`, `openai@6`, and `zod@4`
- Checks stderr for peer dependency conflict patterns
- Runs `fixtures/index.mjs` to verify packages work together

## Running

```bash
pnpm test:e2e:node --filter @test-e2e/node-openai-zod4-compat
```
