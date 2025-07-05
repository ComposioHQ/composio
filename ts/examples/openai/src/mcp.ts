/**
 * OpenAI MCP Gmail Example
 *
 * This example demonstrates how to use Composio MCP with OpenAI to:
 * 1. Create an MCP server for Gmail toolkit
 * 2. Generate URLs for the server
 * 3. Use OpenAI to summarize emails
 *
 */

import { OpenAIResponsesProvider } from '@composio/openai';
import { Composio, ConnectionStatus } from '@composio/core';
import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Initialize Composio with OpenAI provider
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new OpenAIResponsesProvider(),
});

/**
 * Initialize OpenAI client
 */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MCP_SERVER_NAME = "gmail-readonly-server";
const USER_ID = "utkarsah";

// Check if MCP server with name already exists
let existingServer;
try {
  existingServer = await composio.mcp.getByName(MCP_SERVER_NAME);
  console.log(`✅ Found existing MCP server: ${existingServer.id}`);
} catch (error) {
  // Server doesn't exist, create a new one
  console.log(`📝 Creating new MCP server: ${MCP_SERVER_NAME}`);
  
  const mcpConfig = await composio.mcp.create({
    name: MCP_SERVER_NAME,
    serverConfig: [
      {
        authConfigId: "ac_MbbEVd0i1TBG", // Replace with your auth config ID
        allowedTools: [
          "GMAIL_FETCH_EMAILS"
        ]
      }
    ],
    options: {
      // @TODO: Need better name for this
      isChatAuth: true
    }
  });

  // Get the newly created server details
  existingServer = await composio.mcp.getByName(MCP_SERVER_NAME);
  console.log(`✅ MCP server created: ${existingServer.id}`);
}

console.log("Server details:", existingServer);

const connectionStatus = await composio.mcp.getUserConnectionStatus({
  id: existingServer.id,
  userId: USER_ID,
});

console.log("Connection status:", connectionStatus);
const toolkits = connectionStatus.connectedToolkits;
for (let toolkit of Object.values(toolkits)) {
  if(toolkit.type === ConnectionStatus.DISCONNECTED) {
    const requiredParams = await composio.mcp.getConnectionParams({id: existingServer.id, toolkit: toolkit.toolkit});
    console.log("Required params:", requiredParams);
    const connectionStatus = await composio.mcp.authorize({id: existingServer.id, userId: USER_ID, toolkit: toolkit.toolkit});
    console.log("Connection status:", connectionStatus);
if (connectionStatus.redirectUrl) {
  console.log(`Please complete the authentication by visiting the following URL: ${connectionStatus.redirectUrl}`);
  console.log("Press 'Enter' once you have completed the authentication.");
  await new Promise(resolve => process.stdin.once('data', resolve));
}
}
}

// console.log(`✅ MCP server created: ${mcpConfig.id}`);
// console.log(`🔧 Available toolkits: ${mcpConfig.toolkits.join(', ')}`);

// // Get server URLs with user ID (using convenience method)
// const serverUrls = await mcpConfig.getServer({
//   userId: "utkarsh" // Replace with your user ID
// });

// Alternative: You can also use the standalone method to get URLs later
const serverUrls = await composio.mcp.getServer({
  id: existingServer.id,
  userId: USER_ID,
  options: {
    limitTools: ["GMAIL_FETCH_EMAILS"],
    isChatAuth: true
  }
});

// console.log("Server URLs for user:", serverUrls);

// Function to fetch and summarize emails
async function fetchAndSummarizeEmails() {
  try {
    // Use OpenAI to summarize the emails
    console.log('\n=== Generating Email Summary ===');
    const completion = await openai.responses.create({
      model: "gpt-4o-mini",
      input: "I've connected to gmail and I want to fetch the latest email from my inbox and summarize it",
      tools: serverUrls, 
    });

    console.log('\n📬 Email Summary:');
    console.log(completion.output_text);

  } catch (error) {
    console.error('Error fetching or summarizing emails:', error);
  }
}

// Run the email summarization
await fetchAndSummarizeEmails();

console.log('\n✅ OpenAI MCP Example completed successfully!');
console.log('\n💡 Note: The MCP server URLs can be used to connect from other MCP-compatible clients');
console.log(`📍 Server ID for future reference: ${existingServer.id}`);
