import { Composio } from "@composio/core";
import { Agent, hostedMcpTool, run } from "@openai/agents";

const composio = new Composio({ apiKey: "your-composio-api-key" });

console.log("Creating Tool Router session...");
const { mcp } = await composio.create("pg-user-550e8400-e29b-41d4");
console.log(`Tool Router session created: ${mcp.url}`);

const agent = new Agent({
  name: "Personal Assistant",
  instructions: "You are a helpful personal assistant.",
  tools: [
    hostedMcpTool({
      serverLabel: "composio",
      serverUrl: mcp.url,
      headers: {
        "x-api-key": "your-composio-api-key",
      },
    }),
  ],
});

console.log("Running the OpenAI agent to fetch gmail inbox");
const result = await run(
  agent,
  "Summarize all the emails in my Gmail inbox today"
);
console.log(result.finalOutput);
