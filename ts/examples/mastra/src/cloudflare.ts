/**
 * Mastra × Composio — Cloudflare Workers
 *
 * Proves the Mastra provider's tool-wrapping path runs on the Workers runtime,
 * not just Node. Reads config from the Worker `env` binding (no `process.env`),
 * fetches HackerNews tools wrapped for Mastra, and returns their slugs.
 *
 * This entry is what the per-PR CI validates with `wrangler deploy --dry-run`.
 *
 * Local dev:
 *   cd ts/examples/mastra && bun run cf:dev     # then GET http://localhost:8787/
 * Deploy config: wrangler.jsonc
 */
import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';

export interface Env {
  COMPOSIO_API_KEY: string;
}

export default {
  async fetch(_request: Request, env: Env): Promise<Response> {
    const composio = new Composio({
      apiKey: env.COMPOSIO_API_KEY,
      provider: new MastraProvider(),
    });

    const tools = await composio.tools.get('default', {
      toolkits: ['hackernews'],
    });

    return Response.json({
      runtime: 'cloudflare-workers',
      provider: 'mastra',
      tools: Object.keys(tools),
    });
  },
};
