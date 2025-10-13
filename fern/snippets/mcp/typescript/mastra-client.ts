import { MCPClient } from "@mastra/mcp";
import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";

// Use the MCP server URL you generated
const MCP_URL = "https://backend.composio.dev/v3/mcp/YOUR_SERVER_ID?include_composio_helper_actions=true&user_id=YOUR_USER_ID";

export const client = new MCPClient({
  id: "docs-mcp-client",
  servers: {
    composio: { url: new URL(MCP_URL) },
  }
});

export const agent = new Agent({
  name: "Assistant",
  description: "Helpful AI with MCP tools",
  instructions: "Use the MCP tools to answer.",
  model: openai("gpt-4-turbo"),
  tools: await client.getTools()
});

(async () => {
  const res = await agent.generate("What meetings do I have tomorrow? Also check if I have any urgent emails");
  console.log(res.text);
})();