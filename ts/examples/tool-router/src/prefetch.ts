import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { stepCountIs, streamText } from 'ai';

const composio = new Composio({
  provider: new VercelProvider(),
});

const session = await composio.toolRouter.create('user_123', {
  toolkits: ['hackernews'],
});

const tools = await session.tools({
  experimental: {
    prefetchTools: ['HACKERNEWS_GET_USER'],
  },
  beforeExecute: ({ toolSlug, params }) => {
    console.log(`Executing ${toolSlug} with params:`, { params });
    return params;
  },
  afterExecute: ({ toolSlug, result }) => {
    console.log(`Executed ${toolSlug} with result:`, { result });
    return result;
  },
});

console.log(`Loaded ${tools.length} tools`);
Object.keys(tools).forEach(tool => {
  console.log(`🛠️ ${tool}`);
});

const response = await streamText({
  model: openai('gpt-5.2'),
  prompt: 'Who is the user "pg" on hackernews?',
  stopWhen: stepCountIs(10),
  tools,
});

for await (const textPart of response.textStream) {
  process.stdout.write(textPart);
}
