import "dotenv/config";
import { anthropic } from "@ai-sdk/anthropic";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { stepCountIs, streamText } from "ai";

// Initialize Composio with Vercel provider (API key from env var COMPOSIO_API_KEY)
const composio = new Composio({ provider: new VercelProvider() });

// Unique identifier of the user
const userId = "user_123";

// Create a session and get native tools for the user
const session = await composio.create(userId);
const tools = await session.tools();

process.stdout.write("Summarizing your emails from today");
process.stdout.write("\n");

const stream = await streamText({
  system: "You are a helpful personal assistant. Use Composio tools to take action.",
  model: anthropic("claude-sonnet-4-5"),
  prompt: "Summarize my emails from today",
  stopWhen: stepCountIs(10),
  onStepFinish: (step) => {
    for (const toolCall of step.toolCalls) {
      process.stdout.write(`[Using tool: ${toolCall.toolName}]`);
      process.stdout.write("\n");
    }
  },
  tools,
});

for await (const textPart of stream.textStream) {
  process.stdout.write(textPart);
}

process.stdout.write("\n");
process.stdout.write("Tip: If prompted to authenticate, complete the auth flow and run again.");
