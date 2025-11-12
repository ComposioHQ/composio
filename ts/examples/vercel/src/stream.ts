import { Composio } from '@composio/core';
import { ModelMessage, stepCountIs, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { VercelProvider } from '@composio/vercel';
import dotenv from 'dotenv';
import { MessageRoles } from './types';
dotenv.config();

/**
 * Initialize the Composio SDK with the Vercel provider
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

const tools = await composio.tools.get('test-user-id', 'HACKERNEWS_GET_FRONTPAGE');
const stream = await streamText({
  model: openai('gpt-4o-mini'),
  tools: tools,
  prompt: 'Summarize the front page of HackerNews',
  stopWhen: stepCountIs(5),
});

for await (const textPart of stream.textStream) {
  process.stdout.write(textPart);
}
