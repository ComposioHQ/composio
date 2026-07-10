/**
 * Mastra × Composio — Cloudflare Workers
 *
 * Proves the same Tool Router agent path runs on the Workers runtime, not just
 * Node. Reads config from the Worker `env` binding (no `process.env`).
 *
 * This entry is what the per-PR CI validates with `wrangler deploy --dry-run`.
 *
 * Local dev:
 *   cd ts/examples/mastra && bun run cf:dev     # then GET http://localhost:8787/
 * Deploy config: wrangler.jsonc
 */
import {
  runToolRouterHackerNewsAgent,
  type ToolRouterHackerNewsAgentEnvironment,
} from './hackernews-agent/tool-router';

export type Env = Required<ToolRouterHackerNewsAgentEnvironment>;

export default {
  async fetch(_request: Request, env: Env): Promise<Response> {
    const text = await runToolRouterHackerNewsAgent(env);

    return new Response(text, {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};
