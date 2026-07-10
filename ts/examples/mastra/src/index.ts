/**
 * Mastra × Composio — direct tools
 *
 * Fetches a Composio tool as a Mastra tool and lets a Mastra Agent call it.
 * Uses the unauthenticated HACKERNEWS toolkit, so no connected account is
 * required — set only the two keys below and run.
 *
 * Prerequisites:
 *   - COMPOSIO_API_KEY   (https://app.composio.dev)
 *   - OPENAI_API_KEY     (or swap the model — see README)
 *
 * Run:
 *   bun ts/examples/mastra/src/index.ts
 */
import 'dotenv/config';

import { runDirectHackerNewsAgent } from './hackernews-agent/direct';

const text = await runDirectHackerNewsAgent(process.env);

console.log('\n🤖 Agent response:\n');
console.log(text);
