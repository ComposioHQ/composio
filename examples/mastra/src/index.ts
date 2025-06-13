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
 

/**
 * Initialize Composio
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new MastraProvider()
});

const mcpConfig = await composio.mcp.create("random-name-" + Date.now(), {
  toolkits: ["gmail"],
  tools: [],
});

const mcpServers = await mcpConfig.get({
  userIds: ["soham"],
});

console.log(mcpServers);
const mastra = new MCPClient({
  servers: mcpServers
});

console.log(await mastra.getTools());

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
