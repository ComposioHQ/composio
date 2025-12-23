import "dotenv/config";
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { Composio } from "@composio/core";
import { createInterface } from "readline/promises";

// Initialize Composio (API key from env var COMPOSIO_API_KEY or pass explicitly: { apiKey: "your-key" })
const composio = new Composio();

// Unique identifier of the user
const userId = "user_123";

// Create a tool router session for the user
const session = await composio.create(userId);

const options: Options = {
  systemPrompt: `You are a helpful assistant with access to external tools. ` +
    `Always use the available tools to complete user requests.`,
  mcpServers: {
    composio: { 
      type: "http", 
      url: session.mcp.url, 
      headers: session.mcp.headers // Authentication headers for the Composio MCP server 
    },
  },
  permissionMode: "bypassPermissions", // Auto-approve tools (demo only - use "default" in production)
};

// Set up interactive terminal input/output for the conversation
const readline = createInterface({ input: process.stdin, output: process.stdout });

console.log(`
What task would you like me to help you with?
I can use tools like Gmail, GitHub, Linear, Notion, and more.
(Type 'exit' to exit)
Example tasks:
  • 'Summarize my emails from today'
  • 'List all open issues on the composio github repository and create a Google Sheet with the issues'
`);

let isFirstQuery = true;

// Multi-turn conversation with agentic tool calling
while (true) {
  const answer = await readline.question('You: ');
  const input = answer.trim();
  if (input.toLowerCase() === "exit") break;

  process.stdout.write("Claude: ");
  
  // Use `continue: true` to maintain conversation context
  const queryOptions = isFirstQuery ? options : { ...options, continue: true };
  isFirstQuery = false;
  
  try {
    for await (const stream of query({ prompt: input, options: queryOptions })) {
      // Only process assistant messages (the SDK also sends result/error messages)
      if (stream.type === "assistant") {
        const { content } = stream.message;
        for (const block of content) {
          if (block.type === "tool_use") {
            process.stdout.write(`\n[Using tool: ${block.name}]`);
          } else if (block.type === "text") {
            process.stdout.write(block.text);
          }
        }
      }
    }
  } catch (error) {
    console.error("\n[Error]:", error instanceof Error ? error.message : error);
  }
  process.stdout.write("\n");
}

readline.close();
