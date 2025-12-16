import "dotenv/config"; // Load environment variables from .env file
import { Composio } from "@composio/core";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

const composioApiKey = process.env.COMPOSIO_API_KEY;
const userId = "user_123"; // Your user's unique identifier

// Initialize Composio and create a Tool Router session
const composio = new Composio({ apiKey: composioApiKey });
const session = await composio.create(userId);

// Get Tool Router as a native tool
const toolRouter = await session.getToolRouter();

// Use with Vercel AI SDK
const { text, toolCalls, toolResults } = await generateText({
  model: openai("gpt-4-turbo"),
  prompt: "Fetch all open issues from the composio/composio GitHub repository " +
    "and create a summary of the top 5 by priority",
  tools: {
    composio_tool_router: toolRouter.tool,
  },
});

console.log("Result:", text);

// If there were tool calls, they've already been executed
if (toolResults && toolResults.length > 0) {
  console.log("Tool was called and executed successfully");
}