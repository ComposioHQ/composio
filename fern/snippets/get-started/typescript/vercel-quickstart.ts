import { Composio } from '@composio/core';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { VercelProvider } from '@composio/vercel';
import { v4 as uuidv4 } from 'uuid';

const userId = uuidv4(); // The user's ID.
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

const connection = await composio.toolkits.authorize(userId, 'gmail');
console.log(`🔗 Visit the URL to authorize:\n👉 ${connection.redirectUrl}`);

await connection.waitForConnection();

const tools = await composio.tools.get(userId, { tools: ['GMAIL_SEND_EMAIL'] });

const { text } = await generateText({
  model: anthropic('claude-3-7-sonnet-20250219'),
  prompt: "say 'hi from the composio quickstart' to soham.g@composio.dev", // we'll ship you free merch if you do ;)
  tools,
});

console.log(text);
