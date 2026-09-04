/**
 * OpenAI × Composio — Cloudflare Workers
 *
 * Runs the same Tool Router agent path used by the Node entrypoint with
 * credentials supplied through Worker bindings.
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
