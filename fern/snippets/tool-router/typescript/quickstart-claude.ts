import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { Composio } from "@composio/core";
import { createInterface } from "readline/promises";

const composioApiKey = process.env.COMPOSIO_API_KEY!;
const userId = "user_123"; // Your user's unique identifier

const composio = new Composio({ apiKey: composioApiKey });
const session = await composio.create(userId);

const options: Options = {
  systemPrompt: "You are a helpful assistant with access to external tools. "
    + "Always use the available tools to complete user requests instead of just explaining how to do them.",
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

const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log("Chat with Claude (type 'quit' to exit)\n");

while (true) {
  const input = (await rl.question("You: ")).trim();
  if (input.toLowerCase() === "quit" || input.toLowerCase() === "exit") break;

  process.stdout.write("Claude: ");
  for await (const msg of query({ prompt: input, options })) {
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "tool_use") {
          console.log(`\n[Using tool: ${block.name}]`);
        } else if (block.type === "text") {
          process.stdout.write(block.text);
        }
      }
    } else if (msg.type === "result" && msg.subtype === "success") {
      console.log(`\n[Tool Result: ${msg.result}]`);
    }
  }
  console.log();
}

rl.close();