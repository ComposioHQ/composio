/**
 * Anthropic MCP Gmail Example
 *
 * This example demonstrates how to use Composio SDK with Anthropic to:
 * 1. Create an MCP server for Gmail toolkit
 * 2. Connect to the server and use it with Anthropic's API
 * 3. Fetch and summarize emails using the MCP tools
 *
 * Prerequisites:
 * 1. Set up your COMPOSIO_API_KEY and ANTHROPIC_API_KEY in the .env file
 * 2. Set up Gmail authentication in Composio dashboard
 * 3. Run the example: pnpm tsx src/mcp.ts
 */

import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Initialize Composio with the Anthropic provider
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new AnthropicProvider({ cacheTools: true }),
});

const authConfigId = '<auth_config_id>'; // Use your auth config ID
const connectedAccountId = '<connected_account_id>'; // Replace it with the connected account id
const allowedTools = ['GMAIL_FETCH_EMAILS'];

// Create an MCP server with Gmail toolkit
const mcpConfig = await composio.mcp.create(
  'gmail-anthropic-' + Date.now(),
  {
    toolkits: [{
      authConfigId,
    }],
    allowedTools,
  }
);

console.log(`✅ MCP server created: ${mcpConfig.id}`);
console.log(`🔧 Available toolkits: ${mcpConfig.allowedTools.join(', ')}`);

// Get server instance with connected accounts (using convenience method)
const servers = await mcpConfig.getServer({
  userId: connectedAccountId,
  connectedAccountIds: {
    gmail: connectedAccountId,
  },
});

// Alternative: You can also use the standalone method
// const servers = await composio.mcp.getServer(mcpConfig.id, {
//   userId: connectedAccountId,
//   connectedAccountIds: {
//     "gmail": connectedAccountId,
//   }
// });

console.log('\n=== Fetching and Summarizing Recent Emails ===');

// Use Anthropic with the MCP servers
const stream = anthropic.beta.messages.stream({
  model: 'claude-4-sonnet-20250514',
  max_tokens: 64_000,
  mcp_servers: servers,
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
