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
const USER_ID = "utkarsh";

/**
 * Get or create MCP server
 */
async function getOrCreateMCPServer() {
  try {
    // Check if MCP server with name already exists
    const existingServer = await composio.mcp.getByName(MCP_SERVER_NAME);
    console.log(`✅ Found existing MCP server: ${existingServer.id}`);
    return existingServer;
  } catch (error) {
    // Server doesn't exist, create a new one
    console.log(`📝 Creating new MCP server: ${MCP_SERVER_NAME}`);
    
    // Get available auth configs for Gmail
    const authConfigsResponse = await composio.authConfigs.list();
    const gmailAuthConfig = authConfigsResponse.items.find((config) => 
      config.name?.toLowerCase().includes('gmail') || 
      config.name?.toLowerCase().includes('google')
    );
    
    if (!gmailAuthConfig) {
      throw new Error('No Gmail/Google auth config found. Please create one first.');
    }
    
    // Create MCP server using the new API signature
    await composio.mcp.create(
      MCP_SERVER_NAME,
      [
        {
          authConfigId: gmailAuthConfig.id,
          allowedTools: [
            "GMAIL_FETCH_EMAILS"
          ]
        }
      ],
      {
        isChatAuth: true
      }
    );

    // Get the newly created server details
    const newServer = await composio.mcp.getByName(MCP_SERVER_NAME);
    console.log(`✅ MCP server created: ${newServer.id}`);
    return newServer;
  }
}

/**
 * Handle authentication for disconnected toolkits
 */
async function handleAuthentication(serverId: string) {
  const connectionStatus = await composio.mcp.getUserConnectionStatus(
    USER_ID,
    serverId
  );

  console.log("Connection status:", connectionStatus);
  
  const toolkits = connectionStatus.connectedToolkits;
  
  for (let toolkit of Object.values(toolkits)) {
    if (toolkit.type === ConnectionStatus.DISCONNECTED) {
      try {
        const requiredParams = await composio.mcp.getConnectionParams(
          serverId, 
          toolkit.toolkit
        );
        console.log("Required params:", requiredParams);
        
        const authStatus = await composio.mcp.authorize(
          serverId, 
          USER_ID, 
          toolkit.toolkit
        );
        console.log("Connection status:", authStatus);
        
        if (authStatus.redirectUrl) {
          console.log(`Please complete the authentication by visiting the following URL: ${authStatus.redirectUrl}`);
          console.log("Press 'Enter' once you have completed the authentication.");
          await new Promise(resolve => process.stdin.once('data', resolve));
        }
      } catch (error) {
        console.error(`Error handling authentication for ${toolkit.toolkit}:`, error);
      }
    }
  }
}

/**
 * Fetch and summarize emails using OpenAI
 */
async function fetchAndSummarizeEmails(serverUrls: unknown) {
  try {
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
    throw error;
  }
}

/**
 * Main function to run the MCP example
 */
async function main() {
  try {
    // Validate environment variables
    if (!process.env.COMPOSIO_API_KEY) {
      throw new Error('COMPOSIO_API_KEY environment variable is required');
    }
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    // Get or create MCP server
    const server = await getOrCreateMCPServer();
    console.log("Server details:", server);

    // Handle authentication for disconnected toolkits
    await handleAuthentication(server.id);

    // Get server URLs with user ID using the new API signature
    const serverUrls = await composio.mcp.getServer(
      server.id,
      USER_ID,
      {
        limitTools: ["GMAIL_FETCH_EMAILS"],
        isChatAuth: true
      }
    );

    // Fetch and summarize emails
    await fetchAndSummarizeEmails(serverUrls);

    console.log('\n✅ OpenAI MCP Example completed successfully!');
    console.log('\n💡 Note: The MCP server URLs can be used to connect from other MCP-compatible clients');
    console.log(`📍 Server ID for future reference: ${server.id}`);

  } catch (error) {
    console.error('❌ Error running MCP example:', error);
    process.exit(1);
  }
}

// Run the example
main();
