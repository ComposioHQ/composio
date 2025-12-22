import "dotenv/config";
import { anthropic } from "@ai-sdk/anthropic";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { stepCountIs, streamText } from "ai";

// Initialize Composio with Vercel provider (API key from env var COMPOSIO_API_KEY)
const composio = new Composio({ provider: new VercelProvider() });

// Unique identifier of the user
const userId = "user-1234";

// Create a session and get native tools for the user
const session = await composio.create(userId);
const tools = await session.tools();

console.log("Fetching GitHub issues from the Composio repository...");

// Stream the response with tool calling
const stream = await streamText({
  system: "You are a helpful personal assistant. Use Composio tools to take action.",
  model: anthropic("claude-sonnet-4-5"),
  prompt: "Fetch all the open GitHub issues on the composio repository and group them by bugs/features/docs.",
  stopWhen: stepCountIs(10),
  onStepFinish: (step) => {
    for (const toolCall of step.toolCalls) {
      console.log(`[Using tool: ${toolCall.toolName}]`);
    }
  },
  tools,
});

for await (const textPart of stream.textStream) {
  process.stdout.write(textPart);
}

console.log("\n\n---");
console.log("Tip: If prompted to authenticate, complete the auth flow and run again.");
