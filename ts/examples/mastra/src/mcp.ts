/**
 * Mastra MCP Gmail Example
 *
 * This example demonstrates how to use Composio SDK with Mastra to:
 * 1. Create an MCP server for Gmail toolkit
 * 2. Connect to the server and fetch emails using tools
 *
 * Prerequisites:
 * 1. Set up your COMPOSIO_API_KEY and OPENAI_API_KEY the .env file
 * 2. Set up Gmail authentication in Composio dashboard
 * 3. Run the example: pnpm tsx src/mcp.ts
 */

import { MastraProvider } from '@composio/mastra';
import { Composio } from '@composio/core';
import { MCPClient } from '@mastra/mcp';
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import type { MastraMCPServerDefinition } from '@mastra/mcp';
import 'dotenv/config';

/**
 * Initialize Composio
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new MastraProvider(),
});

const authConfigId = '<auth_config_id>'; // Use your auth config ID
const externalUserId = '<external_user_id>'; // Replace it with your user ID
const allowedTools = ['GMAIL_FETCH_EMAILS'];

// Create an MCP server with Gmail toolkit
const mcpConfig = await composio.mcp.create('gmail-mcp-' + Date.now(), {
  toolkits: [
    {
      toolkit: 'gmail',
      authConfigId,
    },
  ],
  allowedTools,
});

console.log(`✅ MCP server created: ${mcpConfig.id}`);

// Generate a user-scoped MCP endpoint.
const mcp = await mcpConfig.generate(externalUserId);
console.log('MCP server instance:', mcp);

// Initialize MCPClient with the server URLs
const mcpClient = new MCPClient({
  servers: {
    composio: {
      url: new URL(mcp.url),
    },
  } satisfies Record<string, MastraMCPServerDefinition>,
});

// Get available tools from MCP client
const tools = await mcpClient.listTools();
console.log(`🔧 Available tools: ${Object.keys(tools).join(', ')}`);

// Create a Gmail agent with the MCP tools
const gmailAgent = new Agent({
  id: 'gmail-mcp-assistant',
  name: 'Gmail Assistant',
  instructions: `
    You are a helpful Gmail assistant that fetches and summarizes emails.
    When fetching emails, provide a clear summary of the results including sender, subject, and date.
    Be concise and provide actionable information based on the email content.
  `,
  model: openai('gpt-4o-mini'),
  tools,
});

// Fetch and summarize recent emails
console.log('\n=== Fetching and Summarizing Recent Emails ===');
const emailResponse = await gmailAgent.generate(
  'Fetch the latest 2 emails and provide a detailed summary with sender, subject, date, and brief content overview for each email'
);
console.log('\n📬 Email Summary:');
console.log(emailResponse.text);

console.log('\n✅ Gmail MCP Example completed successfully!');

await mcpClient.disconnect();
