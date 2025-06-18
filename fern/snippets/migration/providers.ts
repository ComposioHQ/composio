import { Composio } from '@composio/core';
// import { VercelProvider } from '@composio/vercel';

const composio = new Composio({
  // provider: new VercelProvider(),
});
// Can specify other providers too, like OpenAI, Anthropic, Vercel AI SDK.

const tools = await composio.tools.get('user@example.com', {
  tools: ['LINEAR_CREATE_LINEAR_ISSUE', 'GITHUB_CREATE_COMMIT'],
});
// tools returned is formatted for the provider. by default, OpenAI.