import OpenAI from 'openai';
import { Composio } from '@composio/core';

// Initialize clients
const composio = new Composio();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Create MCP server with Linear and Notion tools
const server = await composio.mcp.create(
  "project-docs-server",
  {
    toolkits: [
      { toolkit: "linear", authConfigId: "ac_linear_id" },
      { toolkit: "notion", authConfigId: "ac_notion_id" }
    ],
    allowedTools: ["LINEAR_LIST_ISSUES", "LINEAR_GET_ISSUE", "NOTION_CREATE_PAGE"]
  }
);

// Generate MCP instance for user
const instance = await server.generate("user@example.com");

// Use MCP with OpenAI for project documentation
const response = await openai.responses.create({
  model: "gpt-5",
  tools: [
    {
      type: "mcp",
      server_label: "composio-server",
      server_description: "Composio MCP server with Linear and Notion integrations",
      server_url: instance.url,
      require_approval: "never",
    },
  ],
  input: "Find all completed Linear issues from this sprint and create a Notion page documenting the release notes",
});

console.log("OpenAI MCP Response:", response.output_text);