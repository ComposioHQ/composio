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
import { openai } from '@ai-sdk/openai';
import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';
import { Agent } from '@mastra/core/agent';
import 'dotenv/config';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new MastraProvider(),
});

// Fetch a single tool from the unauthenticated HackerNews toolkit.
// The modifiers below are optional — they show the schema/execution hooks.
const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER_BY_USERNAME', {
  beforeExecute: ({ toolSlug, params }) => {
    console.log(`🔧 executing ${toolSlug} with ${JSON.stringify(params.arguments)}`);
    return params;
  },
  afterExecute: ({ toolSlug, result }) => {
    console.log(`✅ ${toolSlug} finished`);
    return result;
  },
});

const agent = new Agent({
  id: 'hackernews-agent',
  name: 'HackerNews Agent',
  instructions: 'You are a helpful assistant that looks up HackerNews users.',
  model: openai('gpt-5.2'),
  tools,
});

const { text } = await agent.generate([
  { role: 'user', content: 'Tell me about the HackerNews user `pg`.' },
]);

console.log('\n🤖 Agent response:\n');
console.log(text);
