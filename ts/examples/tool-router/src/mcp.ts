import { openai } from '@ai-sdk/openai';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { stepCountIs, streamText } from 'ai';

const composio = new Composio({
  provider: new VercelProvider(),
});
const { mcp } = await composio.toolRouter.create('user_123', { toolkits: ['gmail'] });
const client = await createMCPClient({
  transport: {
    type: 'http',
    url: mcp.url,
    headers: {
      'x-api-key': process.env.COMPOSIO_API_KEY!,
    }
  }
});
const tools = await client.tools();

const stream = await streamText({
  model: openai('gpt-4o-mini'),
  prompt: 'Find my last email from gmail?',
  stopWhen: stepCountIs(10),
  tools,
});

for await (const textPart of stream.textStream) {
  process.stdout.write(textPart);
}
