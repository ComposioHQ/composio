# Tool Router AI - Cloudflare Workers E2E Test

Verifies that the Tool Router AI pattern (MCP session + Vercel AI SDK) works correctly in the Cloudflare Workers runtime environment.

## Why This Exists

This test validates that the full Tool Router workflow works in Cloudflare Workers:

1. Creating MCP sessions via Composio
2. Connecting to MCP servers using `@ai-sdk/mcp`
3. Retrieving tools from the MCP client
4. Using tools with Vercel AI SDK's `streamText`

## What It Tests

| Test                  | Description                                                     |
| --------------------- | --------------------------------------------------------------- |
| MCP Session Creation  | Creates a toolrouter session with specified toolkits            |
| MCP Client Connection | Connects to the MCP server URL returned from session creation   |
| Tool Retrieval        | Retrieves tools from the MCP client                             |
| Agent Execution       | Executes an AI agent using the retrieved tools                  |
| Uses LLMs?            | ✅ (OpenAI GPT)                                                 |

## Isolation Tool

- `wrangler`: Cloudflare's CLI that runs a local workerd instance
- `@cloudflare/vitest-pool-workers`: Runs Vitest tests inside the Workers runtime, not Node.js

This combination provides true runtime isolation—tests execute in the same environment as production Workers.

## Setup

1. Copy `.env.example` to `.env` and add your API keys:
   - `COMPOSIO_API_KEY`: Your Composio API key
   - `OPENAI_API_KEY`: Your OpenAI API key
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
