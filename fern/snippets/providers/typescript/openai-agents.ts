import { Composio } from "@composio/core";
import { Agent, run } from "@openai/agents";
import { OpenAIAgentsProvider } from "@composio/openai-agents";

// add OPENAI_API_KEY in your .env file
const composio = new Composio({
  apiKey: "your-api-key",
  provider: new OpenAIAgentsProvider(),
});

// Create a connected account for the user for the gmail toolkit and replace with your own user id
const externalUserId = "your-user-id";

// Fetch tools for GMAIL toolkit on behalf of the user
const tools = await composio.tools.get(externalUserId, {
    tools: ["GMAIL_SEND_EMAIL"],
  });
  
const agent = new Agent({
    name: "Email Manager",
    tools: tools,
});

console.log(`Running agent...`);
const result = await run(
    agent,
    "Send an email to soham.g@composio.dev with the subject 'Hello from composio' and the body 'Congratulations on sending your first email using AI Agents and Composio!'"
);

console.log(`Received response from agent`);
if (result.finalOutput) {
    console.log(JSON.stringify(result.finalOutput, null, 2));
}