/**
 * Vercel MCP Integration Example
 * 
 * This example demonstrates how to use the VercelProvider with MCP support
 * to create MCP servers and consume them using Vercel AI SDK's experimental_createMCPClient.
 */

import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { experimental_createMCPClient, generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

async function main() {
  // Initialize Composio with the Vercel provider (includes MCP support)
  const composio = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY,
    provider: new VercelProvider(),
  });

  console.log('🚀 Creating MCP server with Gmail toolkit...');

  // Create an MCP server configuration
  const mcpConfig = await composio.mcp.create(
    "Gmail MCP Server",
    [
      {
        toolkit: "gmail",
        allowedTools: ["GMAIL_FETCH_EMAILS", "GMAIL_SEND_EMAIL"],
        authConfigId: process.env.COMPOSIO_AUTH_CONFIG_ID || "default-gmail-config"
      },
    ],
    { useComposioManagedAuth: true }
  );

  console.log(`✅ MCP server created: ${mcpConfig.id}`);
  console.log(`🔧 Available toolkits: ${mcpConfig.toolkits.join(", ")}`);

  // Get MCP server URLs for connected accounts
  const serverUrls = await mcpConfig.getServer({
    userId: process.env.COMPOSIO_USER_ID || "default-user",
  });

  console.log(`📡 Retrieved ${serverUrls.length} MCP server URL(s)`);
  console.log('Server configurations:', serverUrls.map(s => ({ type: s.type, name: s.name })));

  // Create MCP clients for each server URL
  const clients = [];
  const toolSets = [];

  try {
    console.log('\n🔌 Connecting to MCP servers...');
    
    for (const serverConfig of serverUrls) {
      console.log(`   Connecting to: ${serverConfig.name} (${serverConfig.url})`);
      
      const client = await experimental_createMCPClient({
        transport: {
          type: serverConfig.type,
          url: serverConfig.url,
          // Optional: Add headers if needed for authentication
          headers: {
            'User-Agent': 'Composio-Vercel-Example/1.0'
          }
        },
      });
      
      clients.push(client);
      
      // Get tools from this client
      const tools = await client.tools();
      toolSets.push(tools);
      
      console.log(`   ✅ Connected! Available tools: ${Object.keys(tools).join(', ')}`);
    }

    // Combine tools from all clients
    const allTools = toolSets.reduce((acc, tools) => ({ ...acc, ...tools }), {});
    
    console.log(`\n🛠️  Total tools available: ${Object.keys(allTools).length}`);
    console.log(`   Tools: ${Object.keys(allTools).join(', ')}`);

    console.log('\n📧 Generating response using Gmail tools via MCP...');

    // Use with Vercel AI SDK to fetch and summarize emails
    const response = await generateText({
      model: openai('gpt-4o'),
      tools: allTools,
      maxSteps: 3, // Allow multiple steps for complex operations
      messages: [
        {
          role: 'user',
          content: 'Fetch my latest 5 emails and provide a brief summary of each, including sender, subject, and main topic. If there are any urgent emails, highlight them.',
        },
      ],
      onStepFinish: ({ text, toolCalls, toolResults }) => {
        if (toolCalls.length > 0) {
          console.log(`   📋 Step completed with ${toolCalls.length} tool call(s)`);
          toolCalls.forEach((call, i) => {
            console.log(`      ${i + 1}. ${call.toolName}`);
          });
        }
      }
    });

    console.log('\n📋 Email Summary:');
    console.log('================');
    console.log(response.text);

    // Example of using specific Gmail operations
    if (Object.keys(allTools).includes('GMAIL_SEND_EMAIL')) {
      console.log('\n✉️  Example: Sending a follow-up email...');
      
      const followUpResponse = await generateText({
        model: openai('gpt-4o'),
        tools: allTools,
        maxSteps: 2,
        messages: [
          {
            role: 'user',
            content: 'Send a brief thank you email to the most recent sender, acknowledging their message and saying I will respond in detail soon.',
          },
        ],
      });

      console.log('📤 Follow-up email result:');
      console.log(followUpResponse.text);
    }

    console.log('\n✅ Vercel MCP example completed successfully!');
    console.log('\n💡 Key features demonstrated:');
    console.log('   • Created Composio MCP server with Gmail toolkit');
    console.log('   • Used VercelProvider with MCP support to format server URLs');
    console.log('   • Connected to MCP servers using experimental_createMCPClient'); 
    console.log('   • Retrieved and combined tools from multiple MCP servers');
    console.log('   • Used MCP tools with Vercel AI SDK for multi-step operations');
    console.log('   • Proper resource cleanup with client.close()');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    // Important: Close all MCP clients to clean up resources
    console.log('\n🧹 Cleaning up MCP client connections...');
    await Promise.all(clients.map(async (client, i) => {
      try {
        await client.close();
        console.log(`   ✅ Client ${i + 1} closed`);
      } catch (error) {
        console.warn(`   ⚠️  Warning: Error closing client ${i + 1}:`, error);
      }
    }));
  }
}

// Additional helper function to demonstrate MCP server management
async function demonstrateMcpServerManagement() {
  console.log('\n🔧 MCP Server Management Example');
  console.log('=================================');

  const composio = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY,
    provider: new VercelProvider(),
  });

  // List existing MCP servers
  const existingServers = await composio.mcp.list({});
  console.log(`📋 Found ${existingServers.items?.length || 0} existing MCP servers`);

  // Create a multi-toolkit server
  const multiToolkitServer = await composio.mcp.create(
    "Multi-Toolkit MCP Server",
    [
      {
        toolkit: "gmail",
        allowedTools: ["GMAIL_FETCH_EMAILS"],
        authConfigId: "gmail-config"
      },
      {
        toolkit: "slack",
        allowedTools: ["SLACK_SEND_MESSAGE"],
        authConfigId: "slack-config"
      }
    ],
    { useComposioManagedAuth: true }
  );

  console.log(`✅ Multi-toolkit server created: ${multiToolkitServer.id}`);
  console.log(`   Toolkits: ${multiToolkitServer.toolkits.join(', ')}`);

  // Demonstrate server URL retrieval with different options
  console.log('\n📡 Server URL retrieval options:');
  
  // Option 1: By user ID
  const userBasedUrls = await multiToolkitServer.getServer({
    userId: "user-123"
  });
  console.log(`   User-based URLs: ${userBasedUrls.length} server(s)`);

  // Option 2: By connected account IDs (if you have specific account mappings)
  try {
    const accountBasedUrls = await multiToolkitServer.getServer({
      connectedAccountIds: {
        "gmail": "gmail-account-id",
        "slack": "slack-account-id"
      }
    });
    console.log(`   Account-based URLs: ${accountBasedUrls.length} server(s)`);
  } catch (error) {
    console.log('   Account-based URLs: Not configured (this is normal)');
  }

  // Clean up the demo server
  console.log(`\n🧹 Cleaning up demo server: ${multiToolkitServer.id}`);
  await composio.mcp.delete(multiToolkitServer.id);
  console.log('   ✅ Demo server deleted');
}

// Run the main example
if (require.main === module) {
  console.log('🎯 Starting Vercel MCP Provider Example\n');
  
  // Check required environment variables
  const requiredEnvVars = ['COMPOSIO_API_KEY', 'OPENAI_API_KEY'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`   • ${varName}`));
    console.error('\nPlease set these environment variables and try again.');
    process.exit(1);
  }

  main()
    .then(() => {
      console.log('\n🎉 Example completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Example failed:', error);
      process.exit(1);
    });
}

export { main, demonstrateMcpServerManagement }; 