import { openai } from '@ai-sdk/openai'
import { Composio } from "@composio/core";
import { MastraProvider } from "@composio/mastra";
import { Agent } from "@mastra/core/agent";

const composio = new Composio({
  provider: new MastraProvider(),
  apiKey: process.env.COMPOSIO_API_KEY,
});


const tools = await composio.tools.get(
  'default',
  {
    tools: ["GMAIL_SEND_EMAIL"],
  }
);

const agent = new Agent({
  id: 'test-mastra',
  name: "Gmail Agent",
  instructions: "You are a helpful Gmail assistant that provides concise answers.",
  description: "Gmail agent",
  model: openai('gpt-5.2'),
  tools: tools,
});

// const toolsFromAgent = agent.listTools();
// console.dir(toolsFromAgent, { depth: null });

const { text, error } = await agent.generate([
  { role: "user", content: "Send an email to uday@composio.dev saying \"Hi from Mastra\"" },
]);

if (error) {
  console.error("\n🤖 Agent Error:\n");
  console.error(error);
} else {
  console.log("\n🤖 Agent Response:\n");
  console.log(text);
}
