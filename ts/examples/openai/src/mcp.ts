/**
 * OpenAI MCP Gmail Example
 *
 * This example demonstrates how to use Composio SDK with OpenAI to:
 * 1. Create an MCP server for Gmail toolkit
 * 2. Generate URLs for the server
 * 3. Use OpenAI to summarize emails
 *
 */

import { OpenAIResponsesProvider } from '@composio/openai';
import { Composio } from '@composio/core';
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

// Create an MCP server with Gmail toolkit
const mcpConfig = await composio.mcp.create(
  "gmail-mcp-openai-" + Date.now(),
  [
    {
      toolkit: "gmail",
      authConfigId: "<auth_config_id>", // Replace with your auth config ID
      allowedTools: [
        "GMAIL_FETCH_EMAILS"
      ]
    }
  ],
  { useComposioManagedAuth: true }
);

console.log(`✅ MCP server created: ${mcpConfig.id}`);
console.log(`🔧 Available toolkits: ${mcpConfig.toolkits.join(', ')}`);

// Get server URLs with connected accounts (using convenience method)
const serverUrls = await mcpConfig.getServer({
  connectedAccountIds: {
    "gmail": "<connected_account_id>" // Replace with your connected account ID
  }
});

// Alternative: You can also use the standalone method to get URLs later
// const serverUrls = await composio.mcp.getServer(mcpConfig.id, {
//   connectedAccountIds: {
//     "gmail": "<connected_account_id>"
//   }
// });

console.log("Server URLs for connected accounts:", serverUrls);

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
console.log(`📍 Server ID for future reference: ${mcpConfig.id}`);
