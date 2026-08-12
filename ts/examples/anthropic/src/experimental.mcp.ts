import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';
import Anthropic from '@anthropic-ai/sdk';

// 1. Initialize Composio.
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new AnthropicProvider({ cacheTools: true }),
});

const externalUserId = process.env.COMPOSIO_EXAMPLES_USER_ID; // the user id from your database
if (!externalUserId) {
  throw new Error('Set COMPOSIO_EXAMPLES_USER_ID');
}

// 2. Create a session scoped to the Gmail toolkit; it exposes a hosted MCP endpoint
const session = await composio.sessions.create(externalUserId, {
  toolkits: ['gmail'],
  mcp: true,
});

// 3. Initialize Anthropic client.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// 4. Pass the session's MCP endpoint to Anthropic-specific Agent.
const stream = anthropic.beta.messages.stream({
  model: 'claude-sonnet-5',
  max_tokens: 64_000,
  mcp_servers: [
    {
      name: 'composio-gmail',
      url: session.mcp.url,
      type: 'url',
      authorization_token: process.env.COMPOSIO_API_KEY,
    },
  ],
  messages: [
    {
      role: 'user',
      content:
        'Please fetch the latest 2 emails and provide a detailed summary with sender, subject, date, and brief content overview for each email. Format the response in a clear, organized way.',
    },
  ],
  betas: ['mcp-client-2025-04-04'],
});

console.log('\n📬 Email Summary:');
for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    process.stdout.write(event.delta.text);
  }
}
process.stdout.write('\n');

console.log('\n✅ Anthropic MCP Example completed successfully!');
