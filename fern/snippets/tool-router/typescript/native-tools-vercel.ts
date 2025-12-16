import "dotenv/config"; // Load environment variables from .env file
import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

const session = await composio.create("user_123");

// Get native tools from Composio
const tools = await session.tools();

// Use with Vercel AI SDK
const result = await generateText({
  model: openai("gpt-4-turbo"),
  prompt: "Fetch all open issues from the composio/composio GitHub repository and create a summary of the top 5 by priority",
  tools: tools,
});

console.log(`Assistant: ${result.text}`);