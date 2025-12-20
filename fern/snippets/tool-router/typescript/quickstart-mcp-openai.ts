import "dotenv/config"; // Load environment variables from .env file
import { Composio } from "@composio/core";
import { Agent, run, hostedMcpTool, MemorySession } from "@openai/agents";
import { createInterface } from "readline/promises";

const composioApiKey = process.env.COMPOSIO_API_KEY;
const userId = "user-1234"; // Your user's unique identifier

const composio = new Composio({ apiKey: composioApiKey });
const { mcp } = await composio.create(userId);

const agent = new Agent({
  name: "Personal Assistant",
  instructions: "You are a helpful personal assistant. Use Composio tools to take action.",
  model: "gpt-5.2",
  tools: [
    hostedMcpTool({
      serverLabel: "composio",
      serverUrl: mcp.url,
      headers: {
        "x-api-key": composioApiKey,
      },
    }),
  ],
});

// Create a session for persistent multi-turn conversation memory
const session = new MemorySession();

const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log("Assistant: What would you like me to do today?\n");
while (true) {
  const input = await rl.question("> ");
  if (input === "exit") break;
  const result = await run(agent, input, { session });
  console.log(`Assistant: ${result.finalOutput}\n`);
}
rl.close();
