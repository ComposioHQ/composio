import { openai } from '@ai-sdk/openai';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { stepCountIs, streamText } from 'ai';
import { modifiers } from './logger';

const composio = new Composio({
  provider: new VercelProvider(),
});
const session = await composio.create('user_123', { toolkits: ['gmail'] });


const tools = await session.tools(modifiers);

const stream = await streamText({
  model: openai('gpt-4o-mini'),
  prompt: 'Find my last email from gmail?',
  stopWhen: stepCountIs(10),
  tools,
});

for await (const textPart of stream.textStream) {
  process.stdout.write(textPart);
}
