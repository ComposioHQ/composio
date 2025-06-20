import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';
import { Anthropic } from '@anthropic-ai/sdk';

const composio = new Composio({
  provider: new AnthropicProvider({
    cacheTools: false, // default
  }),
});

const anthropic = new Anthropic();

const userId = 'user@acme.com';
const tools = await composio.tools.get(userId, {
  tools: ['GITHUB_GET_OCTOCAT', 'GITHUB_GET_THE_ZEN_OF_GITHUB'],
});

const msg = await anthropic.messages.create({
  model: 'claude-3-5-sonnet-20240620',
  messages: [
    {
      role: 'user',
      content: 'Get me the GitHub Octocat',
    },
  ],
  tools: tools,
  max_tokens: 1000,
});

const res = await composio.provider.handleToolCalls(userId, msg);

console.log(JSON.parse(res[0]).details);
