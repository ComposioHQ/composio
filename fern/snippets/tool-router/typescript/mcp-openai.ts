import "dotenv/config"; // Load environment variables from .env file
import { Composio } from "@composio/core";
import { Agent, hostedMcpTool, run } from "@openai/agents";

const composioApiKey = process.env.COMPOSIO_API_KEY;
const userId = "user_123"; // Your user's unique identifier

// Initialize Composio and create a Tool Router session
const composio = new Composio({ apiKey: composioApiKey });
const session = await composio.create(userId);

// Configure OpenAI agent with Composio MCP server
const agent = new Agent({
  name: "AI Assistant",
  instructions:
    "You are a helpful assistant with access to external tools. " +
    "Always use the available tools to complete user requests instead of just explaining how to do them.",
  model: "gpt-5.2",
  tools: [
    hostedMcpTool({
      serverLabel: "composio",
      serverUrl: session.mcp.url,
      headers: { "x-api-key": composioApiKey },
    }),
  ],
});

// Optional: Pre-authorize tools before use (otherwise you'll get a link during execution)
// const connectionRequest = await session.authorize("github");
// console.log(connectionRequest.redirectUrl);
// const connectedAccount = await connectionRequest.waitForConnection(60000);
// console.log(`Connected: ${connectedAccount.id}`);

// Execute a task that requires GitHub access
const result = await run(
  agent,
  "Fetch all the open GitHub issues on the composio repository " +
  "and group them by bugs/features/docs."
);

console.log(`Result: ${result.finalOutput}`);