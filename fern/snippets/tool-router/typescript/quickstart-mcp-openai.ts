import "dotenv/config";
import { Composio } from "@composio/core";
import { Agent, run, hostedMcpTool, MemorySession } from "@openai/agents";
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
      headers: session.mcp.headers // Authentication headers for the Composio MCP server 
    }),
  ],
});

// Create a memory session for persistent multi-turn conversation
const memory = new MemorySession();

// Set up interactive terminal input/output for the conversation
const readline = createInterface({ input: process.stdin, output: process.stdout });

console.log(`
What task would you like me to help you with?
I can use tools like Gmail, GitHub, Linear, Notion, and more.
(Type 'exit' to exit)
Example tasks:
  • 'Summarize my emails from today'
  • 'List all open issues on the composio github repository and create a Google Sheet with the issues'
`);

// Multi-turn conversation with agentic tool calling
while (true) {
  const input = (await readline.question("You: ")).trim();
  if (input.toLowerCase() === "exit") break;

  console.log("Assistant: ");
  
  try {
    // Multi-turn agentic loop: GPT calls tools and reasons until task is complete
    const result = await run(agent, input, { session: memory });
    console.log(`${result.finalOutput}`);
  } catch (error) {
    console.error("\n[Error]:", error instanceof Error ? error.message : error);
  }
}
readline.close();
