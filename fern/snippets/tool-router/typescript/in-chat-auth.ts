import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import * as readline from "readline";

const composio = new Composio({
  provider: new VercelProvider(),
});

async function chat() {
  const session = await composio.createSession({
    user: "pg-user-550e8400-e29b-41d4",
  });

  const tools = await session.tools();
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
