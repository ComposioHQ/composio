import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();
const composio = new Composio({
  provider: new AnthropicProvider(),
});

const userId = 'user@example.com';
const connection = await composio.toolkits.authorize(userId, 'GITHUB');
console.log(`🔗 Visit the URL to authorize:\n👉 ${connection.redirectUrl}`);

const tools = await composio.tools.get(userId, {
  tools: ['GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER'],
});
await connection.waitForConnection();
const msg = await anthropic.messages.create({
  model: 'claude-3-7-sonnet-latest',
  tools: tools,
  messages: [
    {
      role: 'user',
      content: 'Star the composiohq/composio repository',
    },
  ],
  max_tokens: 1024,
});

const result = await composio.provider.handleToolCalls(userId, msg);
console.log('✅ Tool results:', result);
