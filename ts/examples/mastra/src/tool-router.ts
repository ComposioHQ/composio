/**
 * Mastra × Composio — Tool Router
 *
 * The v1-canonical way to give an agent tools: create a session scoped to one
 * or more toolkits, then hand `session.tools()` to a Mastra Agent. The session
 * exposes Composio's router meta-tools (search + multi-execute), so the agent
 * discovers and runs the toolkit's tools dynamically.
 *
 * Uses the unauthenticated HACKERNEWS toolkit — no connected account needed.
 *
 * Prerequisites:
 *   - COMPOSIO_API_KEY   (https://app.composio.dev)
 *   - OPENAI_API_KEY     (or swap the model — see README)
 *
 * Run:
 *   bun ts/examples/mastra/src/tool-router.ts
 */
import 'dotenv/config';

import { runToolRouterHackerNewsAgent } from './hackernews-agent/tool-router';

const text = await runToolRouterHackerNewsAgent(process.env);

console.log('\n🤖 Agent response:\n');
console.log(text);
