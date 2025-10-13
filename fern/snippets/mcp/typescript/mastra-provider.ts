import { MCPClient } from "@mastra/mcp";
import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { Composio } from "@composio/core";

// Initialize Composio
const composio = new Composio();

// Create MCP server with GitHub, Linear, and Notion tools
const server = await composio.mcp.create(
  "dev-automation-server",
  {
    toolkits: [
      { toolkit: "github", authConfigId: "ac_github_id" },
      { toolkit: "linear", authConfigId: "ac_linear_id" },
      { toolkit: "notion", authConfigId: "ac_notion_id" }
    ],
    allowedTools: [
      "GITHUB_LIST_ISSUES", "GITHUB_CREATE_ISSUE",
      "LINEAR_CREATE_ISSUE", "LINEAR_UPDATE_ISSUE",
      "NOTION_CREATE_PAGE", "NOTION_UPDATE_PAGE"
    ]
  }
);

// Generate MCP instance for user
const instance = await server.generate("user@example.com");

// Create MCP client with Composio server
export const mcpClient = new MCPClient({
  id: "composio-mcp-client",
  servers: {
    composio: { url: new URL(instance.url) },
  }
});

// Create a development workflow agent
export const devAgent = new Agent({
  name: "Dev Assistant",
  description: "AI assistant for development workflow automation",
  instructions: "Help manage GitHub repos, Linear issues, and Notion documentation.",
  model: openai("gpt-4-turbo"),
  tools: await mcpClient.getTools()
});

// Example: Automate development workflow
(async () => {
  const response = await devAgent.generate(
    "Review open GitHub issues, create Linear tasks for bugs labeled 'priority', and update the Notion roadmap page"
  );
  console.log(response.text);
})();