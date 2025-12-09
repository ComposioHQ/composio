import { Composio } from "@composio/core";
import { Agent, run, hostedMcpTool } from "@openai/agents";
const composioApiKey = process.env.COMPOSIO_API_KEY;
const userId = "550e8400-e29b-41d4-a716-446655440000"; // Your user's unique identifier

const composio = new Composio({ apiKey: composioApiKey });

const { mcp } = await composio.create(userId);
console.log(`Tool Router session created: ${mcp.url}`);

const agent = new Agent({
  name: "Personal Assistant",
  instructions: "You are a helpful personal assistant.",
  model: 'gpt-5.1',
  modelSettings: {
    reasoning: { effort: 'low' },
  },
  tools: [
    hostedMcpTool({
      serverLabel: "composio",
      serverUrl: mcp.url,
      headers: {
        'x-api-key': composioApiKey,
      },
    }),
  ],
});

console.log("Running the Open AI agent to fetch gmail inbox")
const result = await run(
  agent,
  "Summarize all the emails in my Gmail inbox today"
);
console.log(result.finalOutput);
