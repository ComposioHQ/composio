# Mastra × Composio

Runnable references for using Composio tools with [Mastra](https://mastra.ai)
agents. Every example uses the **unauthenticated `HACKERNEWS` toolkit**, so no
connected account is required — set two keys and run.

These examples double as tests: they are typechecked and linted on every PR, and
executed nightly against the staging backend.

## Setup

```bash
pnpm install
cp .env.example .env   # then fill in COMPOSIO_API_KEY and OPENAI_API_KEY
```

- `COMPOSIO_API_KEY` — [Composio dashboard](https://app.composio.dev)
- `OPENAI_API_KEY` — the examples default to OpenAI (`gpt-5-mini`)

## Examples

| File                 | What it shows                                                                       | Run                                           |
| -------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------- |
| `src/index.ts`       | Direct tools: fetch one Composio tool as a Mastra tool                              | `bun ts/examples/mastra/src/index.ts`         |
| `src/tool-router.ts` | **Tool Router** (v1-canonical): `composio.sessions.create(...)` → `session.tools()` | `bun ts/examples/mastra/src/tool-router.ts`   |
| `src/cloudflare.ts`  | The same Tool Router agent path on the **Cloudflare Workers** runtime               | `bun run cf:dev` (then `GET localhost:8787/`) |

From this folder you can also use `pnpm start` (index), `pnpm tool-router`, and
`pnpm cf:dev`.

## Using Anthropic instead of OpenAI

The model setup lives in `src/hackernews-agent/direct.ts` and
`src/hackernews-agent/tool-router.ts`. Replace the OpenAI provider in the agent
you want to run and add `ANTHROPIC_API_KEY` to its environment type:

```ts
import { createAnthropic } from '@ai-sdk/anthropic';
// ...
const anthropic = createAnthropic({
  apiKey: requireKey(env, 'ANTHROPIC_API_KEY'),
});
model: anthropic('claude-haiku-4-5'),
```

Add `@ai-sdk/anthropic` to the dependencies and configure the Anthropic key in
the Node environment or Worker bindings, depending on the runtime.

## Runtime notes

- **Node/Bun:** `src/index.ts` and `src/tool-router.ts` read keys from
  `process.env` via `dotenv`.
- **Cloudflare Workers:** `src/cloudflare.ts` reads keys from the Worker `env`
  binding (no `process.env`). Provide both keys with
  `wrangler secret put COMPOSIO_API_KEY` and
  `wrangler secret put OPENAI_API_KEY`. CI validates the Worker build with
  `wrangler deploy --dry-run`.

## Support

- [Documentation](https://docs.composio.dev)
- [GitHub Issues](https://github.com/ComposioHQ/composio/issues)
