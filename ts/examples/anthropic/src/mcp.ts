/**
 * Anthropic MCP Gmail Example
 *
 * This example demonstrates how to use Composio SDK with Anthropic to:
 * 1. Create a tool-router session scoped to the Gmail toolkit
 * 2. Connect Anthropic's MCP client to the session's hosted MCP endpoint
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

const provider = new AnthropicProvider({ cacheTools: true });

// Initialize Composio with the Anthropic provider
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider,
});

const externalUserId = process.env.COMPOSIO_EXAMPLES_USER_ID; // the user ID from your database
if (!externalUserId) {
  throw new Error('Set COMPOSIO_EXAMPLES_USER_ID');
}

// Create a session scoped to the Gmail toolkit; every session exposes a hosted MCP endpoint
const session = await composio.sessions.create(externalUserId, {
  toolkits: ['gmail'],
  mcp: true,
});

console.log(`✅ MCP session created: ${session.sessionId}`);

console.log('\n=== Fetching and Summarizing Recent Emails ===');

// Use Anthropic with the session's MCP endpoint
const stream = anthropic.beta.messages.stream({
  model: 'claude-sonnet-5',
  max_tokens: 64_000,
  mcp_servers: [
    {
      type: 'url',
      url: session.mcp.url,
      name: 'composio-gmail',
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
