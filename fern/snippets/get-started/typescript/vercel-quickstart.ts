import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const composio = new Composio({
  apiKey: "your-api-key",
  provider: new VercelProvider(),
});

// Id of the user in your system
const externalUserId = "pg-test-6dadae77-9ae1-40ca-8e2e-ba2d1ac9ebc4";

// Create an auth config for gmail from the dashboard or programmatically
const authConfigId = "your-auth-config-id";

const connectionRequest = await composio.connectedAccounts.link(
  externalUserId,
  authConfigId
);

// redirect the user to the OAuth flow
const redirectUrl = connectionRequest.redirectUrl;
console.log(`Please authorize the app by visiting this URL: ${redirectUrl}`);

// wait for connection to be established
const connectedAccount = await connectionRequest.waitForConnection();

const tools = await composio.tools.get(externalUserId, "GMAIL_SEND_EMAIL");

// env: OPENAI_API_KEY
const { text } = await generateText({
  model: openai("gpt-5"),
  messages: [
    {
      role: "user",
      content: `Send an email to soham.g@composio.dev with the subject 'Hello from composio 👋🏻' and the body 'Congratulations on sending your first email using AI Agents and Composio!'`,
    },
  ],
  tools: tools // cast to `any` to fix type mismatch
});

console.log("Email sent successfully!", { text });