import { Composio } from "@composio/core";
import { Agent, run, hostedMcpTool } from "@openai/agents";
import { createInterface } from "readline/promises";

const composioApiKey = process.env.COMPOSIO_API_KEY;
const userId = "user-1234"; // Your user's unique identifier

const composio = new Composio({ apiKey: composioApiKey });
const { mcp } = await composio.create(userId);

const agent = new Agent({
  name: "Personal Assistant",
  instructions: "You are a helpful personal assistant. Use Composio tools to take action.",
  model: "gpt-5.1",
  modelSettings: {
    reasoning: { effort: "low" },
  },
  tools: [
    hostedMcpTool({
      serverLabel: "composio",
      serverUrl: mcp.url,
      headers: {
        "x-api-key": composioApiKey,
      },
    }),
  ],
});

const rl = createInterface({ input: process.stdin, output: process.stdout });
while (true) {
  const input = await rl.question("You: ");
  if (input === "exit") break;
  const result = await run(agent, input);
  console.log(`Agent: ${result.finalOutput}\n`);
}
rl.close();
