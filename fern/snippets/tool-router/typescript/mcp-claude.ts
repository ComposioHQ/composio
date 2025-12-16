import "dotenv/config"; // Load environment variables from .env file
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { Composio } from "@composio/core";
import { createInterface } from "readline/promises";

const composioApiKey = process.env.COMPOSIO_API_KEY;
if (!composioApiKey) {
  console.warn("⚠️  Warning: COMPOSIO_API_KEY not set - Claude won't be able to use Composio tools");
}
const userId = "user_123"; // Your user's unique identifier

// Initialize Composio and create a Tool Router session
const composio = new Composio({ apiKey: composioApiKey });
const session = await composio.create(userId);

// Configure Claude with Composio MCP server
const options: Options = {
  systemPrompt: "You are a helpful assistant with access to external tools. " +
    "Always use the available tools to complete user requests.",
  mcpServers: {
    composio: { 
      type: "http", 
      url: session.mcp.url, 
      headers: { "x-api-key": composioApiKey } 
    },
  },
  permissionMode: "bypassPermissions",
  allowDangerouslySkipPermissions: true,
};

async function main() {
  console.log("Starting Claude agent with Composio Tool Router...\n");
  
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  
  // Initial task
  const task = "Fetch all open issues from the composio/composio GitHub repository " +
    "and create a Google Sheet with issue number, title, labels, and author";
  
  console.log(`Task: ${task}\n`);
  
  let isFirstQuery = true;
  
  for await (const msg of query({ prompt: task, options })) {
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "tool_use") {
          console.log(`\n[🔧 Using tool: ${block.name}]`);
        } else if (block.type === "text") {
          process.stdout.write(block.text);
        }
      }
    } else if (msg.type === "result" && msg.subtype === "success") {
      console.log(`\n${msg.result}\n`);
    }
  }
  console.log("\n");
  
  isFirstQuery = false;
  
  // If authentication is needed, Claude will provide a link
  console.log("\nOptions:");
  console.log("  - Type 'quit' to exit");
  console.log("  - Say 'connected' or enter a new task\n");
  
  const userInput = await rl.question("You: ");
  
  if (userInput.toLowerCase() !== "quit" && userInput.toLowerCase() !== "exit" && userInput) {
    // Continue the conversation with the same context
    for await (const msg of query({ prompt: userInput, options: { ...options, continue: true } })) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "tool_use") {
            console.log(`\n[🔧 Using tool: ${block.name}]`);
          } else if (block.type === "text") {
            process.stdout.write(block.text);
          }
        }
      } else if (msg.type === "result" && msg.subtype === "success") {
        console.log(`\n${msg.result}\n`);
      }
    }
    console.log();
  }
  
  rl.close();
}

main().catch(console.error);