import { Composio } from '@composio/core';

// Initialize Composio
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY
});

// Create MCP server with multiple toolkits
const server = await composio.mcp.create("mcp-config-73840", {  // Pick a unique name for your MCP server
  toolkits: [
    {
      authConfigId: "ac_xyz123", // Your Gmail auth config ID
      toolkit: "gmail"
    },
    {
      authConfigId: "ac_abc456", // Your Google Calendar auth config ID
      toolkit: "googlecalendar"
    }
  ],
  allowedTools: ["GMAIL_FETCH_EMAILS", "GMAIL_SEND_EMAIL", "GOOGLECALENDAR_EVENTS_LIST"]
});

console.log(`Server created: ${server.id}`);
console.log(server.id);

// Generate server instance for user
const instance = await composio.mcp.generate("user-73840", server.id);  // Use the user ID for which you created the connected account

console.log("MCP Server URL:", instance.url);