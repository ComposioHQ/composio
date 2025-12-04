import { Composio } from "@composio/core";
import { Agent, run } from "@anthropic-ai/agent";

const composio = new Composio({ apiKey: "your-api-key" });

const { mcp } = await composio.create("pg-user-550e8400-e29b-41d4");

const agent = new Agent({
  name: "Personal Assistant",
  instructions: "You are a helpful personal assistant.",
  mcpServers: [mcp.url],
});

const result = await run(
  agent,
  "Summarize all the emails in my Gmail inbox today"
);
console.log(result.finalOutput);
