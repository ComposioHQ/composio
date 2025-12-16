import "dotenv/config"; // Load environment variables from .env file
import { Composio } from "@composio/core";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { createInterface } from "readline/promises";

const composioApiKey = process.env.COMPOSIO_API_KEY;
const userId = "user_123"; // Your user's unique identifier

// Initialize Composio and create a Tool Router session
const composio = new Composio({ apiKey: composioApiKey });
const session = await composio.create(userId);

// Get Tool Router as a native tool
const toolRouter = await session.getToolRouter();

const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log("Assistant: What would you like me to do today?\n");

// Interactive loop with conversation history
const messages: any[] = [];
while (true) {
  const userInput = await rl.question("> ");
  if (userInput === "exit") break;
  
  // Add user message to history
  messages.push({ role: "user", content: userInput });
  
  // Generate response with Vercel AI SDK
  const { text, toolCalls, toolResults } = await generateText({
    model: openai("gpt-4-turbo"),
    messages: messages,
    tools: {
      composio_tool_router: toolRouter.tool,
    },
  });
  
  // Add assistant response to history
  messages.push({ role: "assistant", content: text });
  
  // Show tool execution feedback
  if (toolCalls && toolCalls.length > 0) {
    for (const toolCall of toolCalls) {
      console.log(`[Executed: ${toolCall.toolName}]`);
    }
  }
  
  console.log(`Assistant: ${text}\n`);
}
rl.close();