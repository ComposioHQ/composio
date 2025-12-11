import { Composio } from "@composio/core";
import { Agent, run, hostedMcpTool } from "@openai/agents";

const composio = new Composio();

const requiredToolkits = ["gmail", "googlecalendar", "linear", "slack"];

const session = await composio.create(userId, {
  manageConnections: false,
});

const toolkits = await session.toolkits();

const pending = requiredToolkits.filter((slug) => {
  const toolkit = toolkits.find((t) => t.slug === slug);
  return !toolkit?.connectedAccount;
});

for (const slug of pending) {
  const connectionRequest = await session.authorize(slug, {
    callbackUri: "https://yourapp.com/onboarding",
  });
  console.log(`Connect ${slug}: ${connectionRequest.redirectUrl}`);
  await connectionRequest.waitForConnection();
}

const agent = new Agent({
  name: "Personal Assistant",
  instructions: "You are a helpful personal assistant.",
  tools: [
    hostedMcpTool({
      serverLabel: "composio",
      serverUrl: session.mcp.url,
    }),
  ],
});

const result = await run(agent, "Summarize my emails from today");
console.log(result.finalOutput);
