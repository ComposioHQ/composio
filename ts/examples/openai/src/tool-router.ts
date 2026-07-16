/**
 * OpenAI × Composio — Tool Router
 *
 * Creates a HackerNews-scoped session, gives the session's router tools to
 * OpenAI, and executes every model-requested tool through that same session.
 *
 * Prerequisites:
 *   - COMPOSIO_API_KEY   (https://app.composio.dev)
 *   - OPENAI_API_KEY
 *
 * Run:
 *   bun ts/examples/openai/src/tool-router.ts
 */
import 'dotenv/config';

import { runToolRouterHackerNewsAgent } from './hackernews-agent/tool-router';

const text = await runToolRouterHackerNewsAgent(process.env);

console.log('\n🤖 Agent response:\n');
console.log(text);
