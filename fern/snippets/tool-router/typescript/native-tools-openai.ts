import "dotenv/config"; // Load environment variables from .env file
import { Composio } from "@composio/core";
import { Agent, run } from "@openai/agents";
import { OpenAIAgentsProvider } from "@composio/openai-agents";

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

// Run the agent with a specific task
const result = await run(
  agent,
  "Fetch all open issues from the composio/composio GitHub repository and create a summary of the top 5 by priority"
);

console.log(`Assistant: ${result.finalOutput}`);