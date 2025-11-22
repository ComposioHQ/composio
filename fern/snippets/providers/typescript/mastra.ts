import { Composio } from "@composio/core";
import { MastraProvider } from "@composio/mastra";
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

const composio = new Composio({
  provider: new MastraProvider(),
});

// create an auth config and a connected account for the user with gmail toolkit
const userId = "your-external-user-id";

const tools = await composio.tools.get(
  userId,
  {
    tools: ["GMAIL_SEND_EMAIL"],
  }
);

const agent = new Agent({
  name: "Email Agent",
  instructions: "You are an email agent. You are responsible for sending emails to the users.",
  model: openai("gpt-5"),
  tools: tools,
});

const { text } = await agent.generateVNext([
  { role: "user", content: "Send an email to soham.g@composio.dev with the subject 'Hello from composio 👋🏻' and the body 'Congratulations on sending your first email using AI Agents and Composio!'" },
]);

console.log("Email sent successfully!", { text });