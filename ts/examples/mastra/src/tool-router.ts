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
import { openai } from '@ai-sdk/openai';
import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';
import { Agent } from '@mastra/core/agent';
import 'dotenv/config';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new MastraProvider(),
});

// Canonical session creation. `composio.sessions.create(...)` is the v1 surface;
// the bare `composio.create(...)` alias is deprecated.
const session = await composio.sessions.create('example-user', {
  toolkits: ['hackernews'],
});

const tools = await session.tools();

const agent = new Agent({
  id: 'hackernews-router-agent',
  name: 'HackerNews Router Agent',
  instructions:
    'You are a helpful assistant. Use the available Composio tools to search for and read HackerNews data before answering.',
  model: openai('gpt-5.2'),
  tools,
});

const { text } = await agent.generate([
  { role: 'user', content: 'What are the current top 3 HackerNews stories? Give me their titles.' },
]);

console.log('\n🤖 Agent response:\n');
console.log(text);
