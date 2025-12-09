import { anthropic } from "@ai-sdk/anthropic";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import { Composio } from "@composio/core";
import { stepCountIs, streamText } from "ai";
const composioApiKey = process.env.COMPOSIO_API_KEY;
const userId = "550e8400-e29b-41d4-a716-446655440000"; // Your user's unique identifier

const composio = new Composio({ apiKey: composioApiKey });

const { mcp } = await composio.create(userId);
console.log(`Tool Router session created: ${mcp.url}`);

const client = await createMCPClient({
  transport: {
    type: "http",
    url: mcp.url,
    headers: {
      "x-api-key": composioApiKey,
    },
  },
});

const tools = await client.tools();

const stream = await streamText({
  model: anthropic("claude-sonnet-4-5"),
  prompt: "Summarize all the emails in my Gmail inbox today",
  stopWhen: stepCountIs(10),
  onStepFinish: (step) => {
    if (step.toolCalls.length > 0) {
      for (const toolCall of step.toolCalls) {
        console.log(`Executed ${toolCall.toolName}`);
      }
    }
  },
  tools,
});

for await (const textPart of stream.textStream) {
  process.stdout.write(textPart);
}
