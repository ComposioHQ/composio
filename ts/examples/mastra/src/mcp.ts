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
import type { ToolAction } from '@mastra/core';
import 'dotenv/config';

function wrapTools(
  servers: Record<string, unknown>,
  tools: Record<string, ToolAction<any, any, any>>
): Record<string, ToolAction<any, any, any>> {
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

const authConfigIdGmail = {
  id: 'ac_-24Hj4FvD-7Z',
}
const authConfigIdGithub = {
  id: 'ac_ooeQeFpZAbsv',
}

// const authConfigIdGmail = await composio.authConfigs.create(Toolkits.GMAIL.slug, {
//   type: 'use_composio_managed_auth',
// })
// console.log('[authConfigIdGmail]');
// console.dir(authConfigIdGmail, { depth: null });

// const authConfigIdGithub = await composio.authConfigs.create(Toolkits.GITHUB.slug, {
//   type: 'use_composio_managed_auth',
// })
// console.log('[authConfigIdGithub]');
// console.dir(authConfigIdGithub, { depth: null });

const mcpConfig = await composio.mcp.create('mcp-config-5', [
  {
    authConfigId: authConfigIdGmail.id,
    allowedTools: [
      'GMAIL_FETCH_EMAILS',
      'GMAIL_GET_CONTACTS',
      'GMAIL_GET_ATTACHMENT',
    ],
  },
  {
    authConfigId: authConfigIdGithub.id,
    allowedTools: [
      'LIST_COMMITS',
    ],
  }
], {
  isChatAuth: true,
})
console.log('[mcpConfig]')
console.dir(mcpConfig, { depth: null });

// Get server instance with connected accounts (using convenience method)
// const serverInstance = await composio.mcp.getServer(mcpConfig.id, 'alberto.schiabel@gmail.com', {
//   isChatAuth: true,
// });

const serverInstance = await composio.mcp.getServer(mcpConfig.id, 'any-name-at-all', {
  // label: '',
  isChatAuth: true,
});

console.log('[serverInstance]')
console.dir(serverInstance, { depth: null });
// 


// const serverInstanceCustom = composio.mcp.createInstance(mcpConfig.id, userId)
// composio.mcp.getServer(mcpConfig.id, userId, { instanceId: 'asd' })

// // Create an MCP server with Gmail toolkit
// const mcpConfig = await composio.mcp.getByName('mcp-config-2')
// console.log('[mcpConfig]')
// console.dir(mcpConfig, { depth: null });

// console.log(`✅ MCP server retrieved: ${mcpConfig.id}`);

// // Get server instance with connected accounts (using convenience method)
// const serverInstance = await composio.mcp.getServer(mcpConfig.id, 'gmail-user-id', {
//   isChatAuth: true,
// });
// console.log('[serverInstance]')
// console.dir(serverInstance, { depth: null });

// userId: alberto.schiabel@gmail.com (default server instance)
// [serverInstance]
// {
//   "mcp-config-2-alberto.schiabel@gmail.com": {
//     url: "https://apollo.composio.dev/v3/mcp/5db99753-36ca-4d77-8d0c-def348ec655b?include_composio_helper_actions=true&user_id=alberto.schiabel%40gmail.com",
//   },
// }

// userId: gmail-user-id (custom server instance)
// [serverInstance]
// {
//   "mcp-config-2-gmail-user-id": {
//     url: "https://apollo.composio.dev/v3/mcp/5db99753-36ca-4d77-8d0c-def348ec655b?include_composio_helper_actions=true&user_id=gmail-user-id",
//   },
// }


// Alternative: You can also use the standalone method
// const serverInstances = await composio.mcp.getServer(mcpConfig.id, {
//   userId: connectedAccountId,
//   connectedAccountIds: {
//     "gmail": connectedAccountId,
//   }
// });

// console.log("Server instances for connected accounts:", serverInstance);

// // Initialize MCPClient with the server URLs
// const mcpClient = new MCPClient({
//   servers: Object.fromEntries(
//     Object.entries(serverInstance as Record<string, { url: string }>).map(([key, value]) => [
//       key,
//       { url: new URL(value.url) }
//     ])
//   ) satisfies Record<string, MastraMCPServerDefinition>
// });

// // Get available tools from MCP client
// const tools = await mcpClient.getTools();
// console.log(`🔧 Available tools: ${Object.keys(tools).join(', ')}`);

// // Create a Gmail agent with the MCP tools
// const gmailAgent = new Agent({
//   name: 'Gmail Assistant',
//   instructions: `
//     You are a helpful Gmail assistant that fetches and summarizes emails.
//     When fetching emails, provide a clear summary of the results including sender, subject, and date.
//     Be concise and provide actionable information based on the email content.
//   `,
//   model: openai('gpt-4o-mini'),
//   tools: wrapTools(serverInstance, tools),
// });

// // Fetch and summarize recent emails
// console.log('\n=== Fetching and Summarizing Recent Emails ===');
// const emailResponse = await gmailAgent.generate(
//   'Fetch the latest 2 emails and provide a detailed summary with sender, subject, date, and brief content overview for each email'
// );
// console.log('\n📬 Email Summary:');
// console.log(emailResponse.text);

// console.log('\n✅ Gmail MCP Example completed successfully!');

// await mcpClient.disconnect();
