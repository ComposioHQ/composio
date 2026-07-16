# OpenAI × Composio

Runnable references for using Composio tools with OpenAI Chat Completions. The
canonical examples use the unauthenticated `HACKERNEWS` toolkit, so no connected
account is required.

These examples double as tests: the package is typechecked and linted on every
PR, and its smoke and agent entries run nightly against the staging backend.

## Setup

```bash
pnpm install
cp ts/examples/openai/.env.example ts/examples/openai/.env
```

Set `COMPOSIO_API_KEY` and `OPENAI_API_KEY` in `.env` before running an agent.

## Canonical examples

| File                 | What it shows                                                    | Run                                        |
| -------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| `src/index.ts`       | Direct tools with a bounded OpenAI function-calling loop         | `pnpm --filter openai-example start`       |
| `src/tool-router.ts` | Tool Router tools executed through the session that created them | `pnpm --filter openai-example tool-router` |
| `src/smoke.ts`       | Provider and Tool Router wrapping without an OpenAI request      | `pnpm --filter openai-example run smoke`   |
| `src/cloudflare.ts`  | The Tool Router agent on the Cloudflare Workers runtime          | `pnpm --filter openai-example run cf:dev`  |

The direct and Tool Router agents are separate modules under
`src/hackernews-agent/`. Each loop is capped at ten model turns and rejects an
empty final response.

## Existing examples

The existing Chat Completions, Responses API, OpenAI Agents SDK, and MCP
experiments remain under `src/` and keep their existing package scripts.

## Cloudflare Workers

The Worker reads credentials from its `env` binding rather than `process.env`.
Configure both secrets before deployment:

```bash
pnpm --filter openai-example exec wrangler secret put COMPOSIO_API_KEY
pnpm --filter openai-example exec wrangler secret put OPENAI_API_KEY
```

CI validates the Worker bundle with `wrangler deploy --dry-run`.
