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
const tools = await session.tools();

const rl = createInterface({ input: process.stdin, output: process.stdout });
const messages: any[] = [];

console.log("Assistant: What would you like me to do today?\n");

while (true) {
  const userInput = await rl.question("> ");
  if (userInput === "exit") break;
  
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