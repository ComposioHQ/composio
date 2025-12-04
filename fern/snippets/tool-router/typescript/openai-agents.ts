import { Composio } from "@composio/core";
import { OpenAIAgentsProvider } from "@composio/openai-agents";
import { Agent, run } from "@openai/agents";

const composio = new Composio({
  apiKey: "your-api-key",
  provider: new OpenAIAgentsProvider(),
});

const { tools } = await composio.create("pg-user-550e8400-e29b-41d4");

const agent = new Agent({
  name: "Personal Assistant",
  instructions: "You are a helpful personal assistant.",
  tools: await tools(),
});

const result = await run(
  agent,
  "Summarize all the emails in my Gmail inbox today"
);
console.log(result.finalOutput);
