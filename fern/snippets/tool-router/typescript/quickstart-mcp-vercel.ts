import "dotenv/config";
import { anthropic } from "@ai-sdk/anthropic";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import { Composio } from "@composio/core";
import { stepCountIs, streamText } from "ai";

// Initialize Composio (API key from env var COMPOSIO_API_KEY or pass explicitly: { apiKey: "your-key" })
const composio = new Composio();

// Unique identifier of the user
const userId = "user_123";

// Create a tool router session for the user
const { mcp } = await composio.create(userId);

// Create an MCP client to connect to the Composio tool router
const client = await createMCPClient({
  transport: {
    type: "http",
    url: mcp.url,
    headers: mcp.headers, // Authentication headers for the Composio MCP server
  },
});
const tools = await client.tools();

console.log("Summarizing your emails from today");

const stream = await streamText({
  system: "You are a helpful personal assistant. Use Composio tools to take action.",
  model: anthropic("claude-sonnet-4-5"),
  prompt: "Summarize my emails from today",
  stopWhen: stepCountIs(10),
  onStepFinish: (step) => {
    for (const toolCall of step.toolCalls) {
      console.log(`[Using tool: ${toolCall.toolName}]`);
    }
  },
  tools,
});

for await (const textPart of stream.textStream) {
  process.stdout.write(textPart);
}

console.log("\n\n---");
console.log("Tip: If prompted to authenticate, complete the auth flow and run again.");
