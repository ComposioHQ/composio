import { openai } from '@ai-sdk/openai';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { stepCountIs, streamText } from 'ai';

const composio = new Composio({
  provider: new VercelProvider(),
});

const userId = process.env.COMPOSIO_EXAMPLES_USER_ID; // the user id from your database
if (!userId) {
  throw new Error('Set COMPOSIO_EXAMPLES_USER_ID');
}

// Enable multi-account mode so the user can connect multiple accounts
// per toolkit (e.g. two Gmail accounts).
const session = await composio.create(userId, {
  toolkits: ['gmail'],
  multiAccount: {
    enable: true,
    maxAccountsPerToolkit: 3,
    requireExplicitSelection: true,
  },
});

// Set an alias while authorizing a connected account for easier identification.
// Aliases are unique per entity and toolkit, so suffix to keep reruns working.
const connectionRequest = await session.authorize('gmail', {
  alias: `work-gmail-${Date.now()}`,
});

console.log(`Visit this URL to authorize: ${connectionRequest.redirectUrl}`);

// requireExplicitSelection means the new alias is only usable once it is ACTIVE.
await connectionRequest.waitForConnection();

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
