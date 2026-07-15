/**
 * OpenAI × Composio — direct tools
 *
 * Fetches a Composio tool in OpenAI function-calling format and runs a bounded
 * Chat Completions tool loop.
 *
 * Prerequisites:
 *   - COMPOSIO_API_KEY   (https://app.composio.dev)
 *   - OPENAI_API_KEY
 *
 * Run:
 *   bun ts/examples/openai/src/index.ts
 */
import 'dotenv/config';

import { runDirectHackerNewsAgent } from './hackernews-agent/direct';

const text = await runDirectHackerNewsAgent(process.env);

console.log('\n🤖 Agent response:\n');
console.log(text);
