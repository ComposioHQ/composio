import "dotenv/config";
import { Composio } from "@composio/core";
import { Agent, hostedMcpTool, run, MemorySession } from "@openai/agents";
import { createInterface } from "readline/promises";

// Initialize Composio (API key from env var COMPOSIO_API_KEY or pass explicitly: { apiKey: "your-key" })
const composio = new Composio();

// Unique identifier of the user
const userId = "user-1234";

// Create a tool router session for the user
const session = await composio.create(userId);

const agent = new Agent({
  name: "Personal Assistant",
  instructions: "You are a helpful personal assistant. Use Composio tools to take action.",
  model: "gpt-5.2",
  tools: [
    hostedMcpTool({
      serverLabel: "composio",
      serverUrl: session.mcp.url,
      headers: session.mcp.headers, // Authentication headers for the Composio MCP server
    }),
  ],
});

// Create a memory session for persistent multi-turn conversation
const memory = new MemorySession();

// Execute an initial task
console.log("Fetching GitHub issues from the Composio repository...\n");
try {
  const initialResult = await run(
    agent,
    "Fetch all the open GitHub issues on the composio repository and group them by bugs/features/docs.",
    { session: memory }
  );
  console.log(`${initialResult.finalOutput}\n`);
} catch (error) {
  console.error("[Error]:", error instanceof Error ? error.message : error);
}

// Continue with interactive conversation
const readline = createInterface({ input: process.stdin, output: process.stdout });

console.log(`
What else would you like me to do?
(Type 'exit' to exit)
`);

while (true) {
  const input = (await readline.question("You: ")).trim();
  if (input.toLowerCase() === "exit") break;

  console.log("Assistant: ");

  try {
    const result = await run(agent, input, { session: memory });
    console.log(`${result.finalOutput}\n`);
  } catch (error) {
    console.error("\n[Error]:", error instanceof Error ? error.message : error);
  }
}
readline.close();
