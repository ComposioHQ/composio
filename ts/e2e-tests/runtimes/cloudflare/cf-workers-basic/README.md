# Cloudflare Workers Compatibility Tests

Verifies that `@composio/core` runs correctly in the Cloudflare Workers runtime environment.

## Why This Exists

Cloudflare Workers use a non-Node.js runtime (workerd) with:

- No native Node.js APIs (unless polyfilled)
- Different module resolution
- Restricted global scope
- Web-standard APIs (Fetch, Request, Response)

This suite ensures `@composio/core` works in this constrained environment without relying on Node.js-specific features.

## What It Tests

| Test                   | Description                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| Import & instantiation | Composio class imports and instantiates without runtime errors      |
| Provider setup         | OpenAIProvider initializes correctly                                |
| Tool retrieval         | `getTools()` returns valid tool definitions                         |
| Live API call          | Execute a real HackerNews action to verify end-to-end functionality |
| Uses LLMs?             | ❌                                                                  |

## Isolation Tool

- `wrangler`: Cloudflare's CLI that runs a local workerd instance
- `@cloudflare/vitest-pool-workers`: Runs Vitest tests inside the Workers runtime, not Node.js

This combination provides true runtime isolation—tests execute in the same environment as production Workers.

## Setup

1. Copy `.env.example` to `.env` and add your `COMPOSIO_API_KEY`
2. Install dependencies: `pnpm install`

## Running

```bash
# Via pnpm (recommended)
pnpm test:e2e
```

## Configuration

| File                | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `wrangler.jsonc`    | Worker configuration (bindings, compatibility flags) |
| `vitest.config.mts` | Vitest setup with Workers pool and env bindings      |
