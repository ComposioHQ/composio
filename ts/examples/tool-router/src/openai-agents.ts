
import { Composio } from "@composio/core";
import { Agent, run, hostedMcpTool } from "@openai/agents";
import { createInterface } from "node:readline/promises";

const composio = await new Composio()
const {mcp} = await composio.create("default");

const agent = new Agent({
  name: "Personal Assistant",
  model: "gpt-5.1",
  instructions: "You are a helpful personal assistant. Use Composio tools to execute tasks.",
  tools: [
    hostedMcpTool({ serverLabel: "composio", serverUrl: mcp.url, headers: {
      'x-api-key': process.env.COMPOSIO_API_KEY!,
    } }),
  ],
});

const rl = createInterface({ input: process.stdin, output: process.stdout });

for (let input: any = await rl.question("You: "); input !== "exit"; ) {
  const result = await run(agent, input);
  console.log(`Agent: ${result.finalOutput}\n`);
  input = [...result.history, { role: "user" as const, content: await rl.question("You: ") }];
}

rl.close();
