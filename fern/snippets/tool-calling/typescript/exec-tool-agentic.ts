import { Composio } from '@composio/core';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { VercelProvider } from '@composio/vercel';

// Use a unique identifier for each user in your application
const userId = 'user-k7334';

// Initialize Composio toolset
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

// Get all tools for the user
const tools = await composio.tools.get(userId, {
  toolkits: ['HACKERNEWS_GET_LATEST_POSTS'],
  limit: 10,
});

// Generate a deep research on hackernews
const { text } = await generateText({
  model: anthropic('claude-sonnet-4-20250514'),
  messages: [
    {
      role: 'user',
      content: 'Do a thorough DEEP research on the top articles on Hacker News about Composio',
    },
  ],
  tools,
});

console.log(text);
