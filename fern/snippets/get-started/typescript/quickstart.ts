import { Composio } from "@composio/core";
import { AnthropicProvider } from "@composio/anthropic";
import Anthropic from "@anthropic-ai/sdk";

// env: ANTHROPIC_API_KEY
const anthropic = new Anthropic();

const composio = new Composio({
  apiKey: "your-api-key",
  provider: new AnthropicProvider(),
  toolkitVersions: {
    "gmail": "20251111_00",
  }
});

// Id of the user in your system
const externalUserId = "pg-test-6dadae77-9ae1-40ca-8e2e-ba2d1ad9ebc4";

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
console.log(
`Connection established successfully! Connected account id: ${connectedAccount.id}`
);

// Fetch tools for your user and execute
const tools = await composio.tools.get(externalUserId, {
    tools: ["GMAIL_SEND_EMAIL"],
});

console.log(tools);
const msg = await anthropic.messages.create({
  model: "claude-sonnet-4-5",
  messages: [
      {
      role: "user",
      content: `Send an email to soham.g@composio.dev with the subject 'Hello from composio 👋🏻' and the body 'Congratulations on sending your first email using AI Agents and Composio!'`,
      },
  ],
  tools: tools,
  max_tokens: 1000,
});


const res = await composio.provider.handleToolCalls(externalUserId, msg);
console.log("Email sent successfully!");
