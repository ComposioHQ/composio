/**
 * Mastra Example
 *
 * This example demonstrates how to use Composio SDK for mastra.
 *
 * Prerequisites:
 * 1. Set up your COMPOSIO_API_KEY in the .env file
 * 2. Set up your OPENAI_API_KEY in the .env file
 * 3. Run the example: pnpm start
 */
import { MastraProvider } from '@composio/mastra';
import { Composio } from '@composio/core';
import 'dotenv/config';
import { MCPClient } from '@mastra/mcp';
import type { MastraMCPServerDefinition } from '@mastra/mcp';
import type { BaseComposioProvider } from '@composio/core/src/provider/BaseProvider';

/**
 * Initialize Composio
 */
const composio = new Composio({
  apiKey: "e0tfgmol8f6iw0v0ttq0e",
  provider: new MastraProvider(),
});

// Create an MCP server with Gmail toolkit
const mcpConfig = await composio.mcp.create(
  "random-name-" + Date.now(),
  [
    {
      toolkit: "gmail",
      authConfigId: "ac_default",
      allowedTools: ["GMAIL_FETCH_EMAILS", "GMAIL_SEND_EMAIL"]
    }
  ],
  { useManagedAuthByComposio: true }
);

// Get server instance for a user
const userResponse = await mcpConfig.getServer({
  user_id: "soham"
});

console.log("Server instances for user:", userResponse);

// Or get server instances with connected accounts
const accountResponse = await mcpConfig.getServer({
  connected_account_ids: {
    "gmail": "acc_123"
  }
});

console.log("Server instances for connected accounts:", accountResponse);

// Initialize MCPClient with the server URLs
const mastra = new MCPClient({
  servers: {
    // For user-based servers
    "random-name-soham": {
      url: (userResponse as unknown as Record<string, { url: URL }>)["random-name-soham"].url
    },
    // For account-based servers
    "random-name-acc_123": {
      url: (accountResponse as unknown as Record<string, { url: URL }>)["random-name-acc_123"].url
    }
  } satisfies Record<string, MastraMCPServerDefinition>
});

// console.log(await mastra.getTools());

// /**
//  * Get the tools from Composio
//  * Attach beforeExecute and afterExecute hooks to the tools for logging
//  */
// const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER', {
//   modifySchema: (toolSlug, toolkitSlug, schema) => {
//     console.log(
//       `🔄 Modifying schema for tool ${toolSlug}/${toolkitSlug} with schema ${JSON.stringify(schema)}`
//     );
//     return schema;
//   },
//   beforeExecute: (toolSlug, toolkitSlug, input) => {
//     console.log(`🔄 Executing tool ${toolSlug}/${toolkitSlug} with input ${JSON.stringify(input)}`);
//     return input;
//   },
//   afterExecute: (toolSlug, toolkitSlug, output) => {
//     console.log(
//       `✅ Tool ${toolSlug}/${toolkitSlug} executed successfully with output ${JSON.stringify(output)}`
//     );
//     return output;
//   },
// });

// /**
//  * Create the mastra agent
//  */
// const hackernewsAgent = new Agent({
//   name: 'Weather Agent',
//   instructions:
//     'You are a helpful assistant that can use the Hackernews API to get user information.',
//   model: openai('gpt-4o-mini'),
//   mcpServers: mcpServers,
// });

// /**
//  * Generate a response from the agent
//  */
// const { text } = await hackernewsAgent.generate([
//   { role: 'user', content: 'Tell me about the user `pg` on hackernews' },
// ]);

// console.log('\n🤖 Agent Response:\n');
// console.log(text);
