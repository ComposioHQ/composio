import { Composio } from '@composio/core';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const tools = await composio.tools.get('default', {
  tools: ['HACKERNEWS_GET_USER'],
});

const query = 'What is the user "pg"';

const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    {
      role: 'system',
      content: 'You are a helpful assistant that can use tools to answer questions.',
    },
    { role: 'user', content: query },
  ],
  tools: tools,
  tool_choice: 'auto',
});

const toolCall = await composio.provider.handleToolCall('default', response);

console.log(toolCall);
