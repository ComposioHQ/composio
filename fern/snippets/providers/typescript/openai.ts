import { Composio } from '@composio/core';
import { OpenAI } from 'openai';

// Explicitly use OpenAI provider
const composio = new Composio();

const openai = new OpenAI();

const userId = 'user-dev-178';
const tools = await composio.tools.get(userId, 
    {
        toolkits: ['HACKERNEWS'],
    },
);

const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: "What's the latest news on OpenAI's image generation models on Hackernews?"
      },
    ],
    tools: tools
});

const result = await composio.provider.handleToolCalls(userId, completion);

console.log(JSON.stringify(result, null, 2))
