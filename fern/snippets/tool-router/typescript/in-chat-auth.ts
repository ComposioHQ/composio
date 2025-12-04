import { openai } from "@ai-sdk/openai";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import { Composio } from "@composio/core";
import { generateText } from "ai";
import * as readline from "readline";

const composio = new Composio({ apiKey: "your-composio-api-key" });

async function chat() {
  console.log("Creating Tool Router session...");
  const { mcp } = await composio.create("pg-user-550e8400-e29b-41d4");
  console.log(`Tool Router session created: ${mcp.url}`);

  const client = await createMCPClient({
    transport: {
      type: "http",
      url: mcp.url,
      headers: {
        "x-api-key": "your-composio-api-key",
      },
    },
  });

  const tools = await client.tools();
  const messages: { role: "user" | "assistant"; content: string }[] = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("Chat with your agent. Type 'exit' to quit.\n");

  const prompt = () => {
    rl.question("You: ", async (input) => {
      if (input.toLowerCase() === "exit") {
        rl.close();
        return;
      }

      messages.push({ role: "user", content: input });

      const { text } = await generateText({
        model: openai("gpt-4o"),
        tools,
        messages,
        maxSteps: 5,
      });

      console.log(`Agent: ${text}\n`);
      messages.push({ role: "assistant", content: text });

      prompt();
    });
  };

  prompt();
}

chat();
