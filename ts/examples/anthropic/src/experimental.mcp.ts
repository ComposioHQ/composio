import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';
import Anthropic from '@anthropic-ai/sdk';

// 1. Initialize Composio.
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new AnthropicProvider({ cacheTools: true }),
});

const authConfigId = '<auth_config_id>'; // Use your auth config ID
const externalUserId = '<external_user_id>'; // Replace it with the your user id
const allowedTools = ['GMAIL_FETCH_EMAILS'];

// 2. Create an MCP config
const mcpConfig = await composio.mcp.create(`${Date.now()}`, {
  toolkits: [
    {
      toolkit: 'gmail',
      authConfigId,
    },
  ],
  allowedTools,
  manuallyManageConnections: true,
});

// 3. Retrieve the MCP server instance for the connected accounts
const mcp = await composio.mcp.generate(externalUserId, mcpConfig.id);

// 4. Initialize Anthropic client.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// 5. Pass servers to Anthropic-specific Agent.
const stream = anthropic.beta.messages.stream({
  model: 'claude-4-sonnet-20250514',
  max_tokens: 64_000,
  mcp_servers: [
    {
      name: mcp.name,
      url: mcp.url,
      type: 'url',
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
