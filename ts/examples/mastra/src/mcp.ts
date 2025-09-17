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

function wrapTools(servers: Record<string, any>, tools: Record<string, any>): Record<string, any> {
  const prefixes = Object.keys(servers);

  function removePrefix(str: string): string {
    for (const prefix of prefixes) {
      if (str.startsWith(prefix)) {
        return str.slice(prefix.length + 1);
      }
    }
    return str;
  }

  return Object.fromEntries(
    Object.entries(tools).map(([key, tool]) => {
      return [removePrefix(key), tool] as const;
    })
  );
}

/**
 * Initialize Composio
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new MastraProvider(),
});

const authConfigId = '<auth_config_id>'; // Use your auth config ID
const connectedAccountId = 'alberto.schiabel@gmail.com'; // "<connected_account_id>"; // Replace it with the connected account id
const allowedTools = ['GMAIL_FETCH_EMAILS'];

// Create an MCP server with Gmail toolkit
const mcpConfig = await composio.mcp.create(
  'gmail-mcp-' + Date.now(),
  [
    {
      authConfigId,
      allowedTools,
    },
  ],
  { isChatAuth: true }
);

console.log(`✅ MCP server created: ${mcpConfig.id}`);
console.log(`🔧 Available toolkits: ${mcpConfig.toolkits.join(', ')}`);

// Get server instance with connected accounts (using convenience method)
const serverInstance = await mcpConfig.getServer({
  userId: connectedAccountId,
  connectedAccountIds: {
    gmail: connectedAccountId,
  },
});

// Alternative: You can also use the standalone method
// const serverInstances = await composio.mcp.getServer(mcpConfig.id, {
//   userId: connectedAccountId,
//   connectedAccountIds: {
//     "gmail": connectedAccountId,
//   }
// });

console.log('Server instances for connected accounts:', serverInstance);

// Initialize MCPClient with the server URLs
const mcpClient = new MCPClient({
  servers: Object.fromEntries(
    Object.entries(serverInstance as Record<string, { url: string }>).map(([key, value]) => [
      key,
      { url: new URL(value.url) },
    ])
  ) satisfies Record<string, MastraMCPServerDefinition>,
});

// Get available tools from MCP client
const tools = await mcpClient.getTools();
console.log(`🔧 Available tools: ${Object.keys(tools).join(', ')}`);

// Create a Gmail agent with the MCP tools
const gmailAgent = new Agent({
  name: 'Gmail Assistant',
  instructions: `
    You are a helpful Gmail assistant that fetches and summarizes emails.
    When fetching emails, provide a clear summary of the results including sender, subject, and date.
    Be concise and provide actionable information based on the email content.
  `,
  model: openai('gpt-4o-mini'),
  tools: wrapTools(serverInstance, tools),
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
