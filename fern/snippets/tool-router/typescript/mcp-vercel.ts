// Generate text completions with Vercel AI SDK using Composio Tool Router

import { Composio } from "@composio/core";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createMCPClient } from "@ai-sdk/mcp";
import { generateText } from "ai";

const composioApiKey = process.env.COMPOSIO_API_KEY!;
const userId = "user_123"; // Your user's unique identifier

// Initialize Composio and create a Tool Router session
const composio = new Composio({ apiKey: composioApiKey });
const session = await composio.create(userId);

// Create MCP client connected to Composio
const mcpClient = await createMCPClient({
  type: "http",
  url: session.mcp.url,
  headers: { "x-api-key": composioApiKey },
});

// Create Anthropic model
const anthropic = createAnthropic();

/**
 * Execute a task using Vercel AI SDK with MCP tools
 */
async function executeTask(task: string) {
  const result = await generateText({
    model: anthropic("claude-3-5-sonnet-latest"),
    prompt: task,
    tools: mcpClient.tools,
    system: "You are a helpful assistant with access to external tools. Always use the available tools to complete user requests instead of just explaining how to do them.",
  });
  
  return result.text;
}

// Example usage
async function main() {
  // Execute a task that requires tools
  let result = await executeTask(
    "Get the current weather in San Francisco"
  );
  console.log(result);
  
  // Execute another task with tools
  result = await executeTask(
    "Search for the latest news about AI and summarize the top 3 stories"
  );
  console.log(result);
}

main().catch(console.error);