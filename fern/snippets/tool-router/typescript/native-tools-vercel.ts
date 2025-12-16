import "dotenv/config";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { generateText, stepCountIs, ModelMessage } from "ai";
import { createInterface } from "readline/promises";
import { anthropic } from "@ai-sdk/anthropic";

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

const session = await composio.create("user_123");
const tools = await session.tools();

const rl = createInterface({ input: process.stdin, output: process.stdout });
const messages: ModelMessage[] = [];

// Initial task
const initialPrompt = "Fetch all the open GitHub issues on the composio repository and group them by bugs/features/docs.";
console.log("Executing initial task: Fetching GitHub issues...\n");

while (true) {
  const userInput = messages.length === 0 ? initialPrompt : await rl.question("> ");
  if (userInput.toLowerCase() === "exit") break;
  
  messages.push({ role: "user", content: userInput });
  
  const result = await generateText({
    model: anthropic("claude-sonnet-4-5"),
    messages: messages,
    tools: tools,
    stopWhen: stepCountIs(10),
  });
  
  messages.push({ role: "assistant", content: result.text });
  console.log(`Assistant: ${result.text}\n`);
}

rl.close();