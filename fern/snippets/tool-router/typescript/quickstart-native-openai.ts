import "dotenv/config"; // Load environment variables from .env file
import { Composio } from "@composio/core";
import { Agent, run, MemorySession } from "@openai/agents";
import { OpenAIAgentsProvider } from "@composio/openai-agents";
import { createInterface } from "readline/promises";

const composioApiKey = process.env.COMPOSIO_API_KEY;
const userId = "user_123"; // Your user's unique identifier

const composio = new Composio({ apiKey: composioApiKey, provider: new OpenAIAgentsProvider() });
const session = await composio.create(userId);

// Get native tools from Composio
const tools = await session.tools();

// Create OpenAI agent with Composio tools
const agent = new Agent({
  name: "AI Assistant",
  instructions: "You are a helpful assistant with access to external tools. Use the available tools to complete user requests.",
  model: "gpt-5.2",
  tools: tools,
});

// Create session for multi-turn conversation
const conversationSession = new MemorySession();

const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log("Assistant: What would you like me to do today? Type 'exit' to end the conversation.\n");

while (true) {
  const userInput = await rl.question("> ");
  if (userInput.toLowerCase() === "exit") break;
  
  // Run agent with session to maintain context
  const result = await run(agent, userInput, { session: conversationSession });
  console.log(`Assistant: ${result.finalOutput}\n`);
}
rl.close();