// Execute AI tasks with Claude using Composio Tool Router

import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { Composio } from "@composio/core";

const composioApiKey = process.env.COMPOSIO_API_KEY!;
const userId = "user_123"; // Your user's unique identifier

// Initialize Composio and create a Tool Router session
const composio = new Composio({ apiKey: composioApiKey });
const session = await composio.create(userId);

// Configure Claude with Composio MCP server
const options: Options = {
  systemPrompt: "You are a helpful assistant with access to external tools. Always use the available tools to complete user requests instead of just explaining how to do them.",
  mcpServers: {
    composio: { 
      type: "http", 
      url: session.mcp.url, 
      headers: { "x-api-key": composioApiKey } 
    },
  },
  permissionMode: "bypassPermissions",
  allowDangerouslySkipPermissions: true,
};

/**
 * Execute a single task using Claude with MCP tools
 */
async function executeTask(task: string): Promise<string> {
  let response = "";
  
  // Send the task to Claude and collect the response
  for await (const msg of query({ prompt: task, options })) {
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text") {
          response += block.text;
        }
      }
    }
  }
  
  return response;
}

// Example usage
async function main() {
  // Execute a task that requires tools
  let result = await executeTask(
    "Get the top story from Hacker News and summarize it"
  );
  console.log(result);
  
  // Execute another task
  result = await executeTask(
    "Create a GitHub issue in composio/composio repo about improving documentation"
  );
  console.log(result);
}

main().catch(console.error);