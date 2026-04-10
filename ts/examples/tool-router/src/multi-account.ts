import { openai } from '@ai-sdk/openai';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { stepCountIs, streamText } from 'ai';

const composio = new Composio({
  provider: new VercelProvider(),
});

// Enable multi-account mode so the user can connect multiple accounts
// per toolkit (e.g. two Gmail accounts).
const session = await composio.create('user_123', {
  toolkits: ['gmail'],
  multiAccount: {
    enable: true,
    maxAccountsPerToolkit: 3,
    requireExplicitSelection: true,
  },
});

// Set an alias on a connected account for easier identification
await composio.connectedAccounts.update('ca_abc123', {
  alias: 'work-gmail',
});

const tools = await session.tools();

const stream = await streamText({
  model: openai('gpt-4o-mini'),
  prompt: 'Find my last email from my work Gmail account',
  stopWhen: stepCountIs(10),
  tools,
});

for await (const textPart of stream.textStream) {
  process.stdout.write(textPart);
}
