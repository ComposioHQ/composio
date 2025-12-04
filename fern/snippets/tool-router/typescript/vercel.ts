import { openai } from "@ai-sdk/openai";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import { Composio } from "@composio/core";
import { stepCountIs, streamText } from "ai";

const composio = new Composio({ apiKey: "your-composio-api-key" });

console.log("Creating Tool Router session...");
const { mcp } = await composio.create("pg-user-550e8400-e29b-41d4");
console.log(`Tool Router session created: ${mcp.url}`);

const client = await createMCPClient({
  transport: {
    type: "http",
    url: mcp.url,
    headers: {
      "x-api-key": "your-composio-api-key",
    },
  },
});

const tools = await client.tools();

const stream = await streamText({
  model: openai("gpt-4o"),
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
