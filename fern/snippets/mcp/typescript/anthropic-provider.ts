import Anthropic from '@anthropic-ai/sdk';
import { Composio } from '@composio/core';

// Initialize clients
const composio = new Composio();
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Create MCP server with Google Sheets tools
const server = await composio.mcp.create(
  "analytics-server",
  {
    toolkits: [
      { toolkit: "googlesheets", authConfigId: "ac_sheets_id" }
    ],
    allowedTools: ["GOOGLESHEETS_GET_DATA", "GOOGLESHEETS_UPDATE_DATA", "GOOGLESHEETS_CREATE_SHEET"]
  }
);

// Generate MCP instance for user
const instance = await server.generate("user@example.com");

// Use MCP with Anthropic for spreadsheet operations
const response = await anthropic.beta.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 1000,
  messages: [{
    role: "user",
    content: "Analyze the sales data in my Google Sheets 'Q4 Revenue' spreadsheet, calculate month-over-month growth, and add a new summary sheet with visualizations"
  }],
  mcp_servers: [{
    type: "url",
    url: instance.url,
    name: "composio-mcp-server"
  }],
  betas: ["mcp-client-2025-04-04"]  // Enable MCP beta
});

console.log(response.content);