import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';
import { Anthropic } from '@anthropic-ai/sdk';

const userId = '0000-1111-2222-3333'; // User's UUID

const anthropic = new Anthropic();
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new AnthropicProvider(),
});

const tools = await composio.tools.get(userId, {
  tools: ['COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH'],
});

const msg = await anthropic.messages.create({
  model: 'claude-3-7-sonnet-latest',
  tools: tools,
  messages: [
    {
      role: 'user',
      content: "What's new with OpenAI?",
    },
  ],
  max_tokens: 1024,
});

const result = await composio.provider.handleToolCalls(userId, msg);
console.log(result);
