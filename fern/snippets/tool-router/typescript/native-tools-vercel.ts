import "dotenv/config";
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { createInterface } from "readline/promises";

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

const session = await composio.create("user_123");

// Get native tools from Composio
const tools = await session.tools();

const messages: any[] = [];

// Execute an initial task that requires GitHub access
console.log("Executing initial task: Fetching GitHub issues...\n");
const initialResult = await generateText({
  model: openai("gpt-4-turbo"),
  prompt: "Fetch all the open GitHub issues on the composio repository and group them by bugs/features/docs.",
  tools: tools,
});
console.log(`Result: ${initialResult.text}\n`);

// Add initial conversation to history
messages.push(
  { role: "user", content: "Fetch all the open GitHub issues on the composio repository and group them by bugs/features/docs." },
  { role: "assistant", content: initialResult.text }
);

// Continue with interactive conversation
const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log("Assistant: What else would you like me to do? Type 'exit' to end the conversation.\n");

while (true) {
  const userInput = await rl.question("> ");
  if (userInput.toLowerCase() === "exit") break;
  
  messages.push({ role: "user", content: userInput });
  
  const result = await generateText({
    model: openai("gpt-4-turbo"),
    messages: messages,
    tools: tools,
  });
  
  messages.push({ role: "assistant", content: result.text });
  console.log(`Assistant: ${result.text}\n`);
}

rl.close();