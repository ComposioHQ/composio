import { Composio } from '@composio/core';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { VercelProvider } from '@composio/vercel';

const userId = '0000-1111-2222-3333';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

const tools = await composio.tools.get(userId, {
  toolkits: ['COMPOSIO_SEARCH'],
  limit: 10,
});

const { text } = await generateText({
  model: anthropic('claude-3-7-sonnet-20250219'),
  messages: [
    {
      role: 'user',
      content: 'Do a thorough DEEP research on Ilya Sutskever',
    },
  ],
  tools,
  maxSteps: 5,
});

console.log(text);
