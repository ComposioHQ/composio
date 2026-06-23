import { defineAgent } from 'eve';

/**
 * Eve — the Composio docs assistant.
 *
 * Runs inside the docs Next.js app (mounted via `withEve` in next.config.mjs)
 * and answers questions grounded in the docs. The `search_docs` tool returns
 * doc snippets and their URLs so Eve can cite and link specific pages.
 *
 * Model: `openai/gpt-5.4-mini` routed through the Vercel AI Gateway. Set
 * `AI_GATEWAY_API_KEY` locally and in the preview environment (or `vercel link`
 * for an OIDC token).
 */
export default defineAgent({
  model: 'openai/gpt-5.4-mini',
});
