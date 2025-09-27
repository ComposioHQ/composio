import { openai } from '@ai-sdk/openai';
import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';
import { MCPClient as MastraMCPClient } from '@mastra/mcp';
import { Agent as MastraAgent } from '@mastra/core/agent';

// 1. Initialize Composio.
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new MastraProvider(),
});

const externalUserId = '<external_user_id>'; // Replace it with the user id id

// 2. Create an tool router session
const mcpSession = await composio.experimental.toolRouter.createSession(externalUserId, {
  toolkits: ["gmail"],
  manuallyManageConnections: true,
});


// 3. Create a Mastra-specific MCP client.
//    This client needs to remain "alive" not be dropped by the GC until
//    the tools are retrieved from it.
const mcpClient = new MastraMCPClient({
  servers: {
    composio: {
      url: new URL(mcpSession.url),
    },
  },
});

// 4. Retrieve tools.
const tools = await mcpClient.getTools();

// 5. Pass tools to Mastra-specific Agent.
const agent = new MastraAgent({
  name: 'Gmail Assistant',
  instructions: `
    You are a helpful Gmail assistant that fetches and summarizes emails.
    When fetching emails, provide a clear summary of the results including sender, subject, and date.
    Be concise and provide actionable information based on the email content.
  `,
  model: openai('gpt-4o-mini'),
  tools,
});

// Fetch and summarize recent emails.
console.log('\n=== Fetching and Summarizing Recent Emails ===');
const emailResponse = await agent.generate(
  'Fetch the latest 2 emails and provide a detailed summary with sender, subject, date, and brief content overview for each email'
);
console.log('\n📬 Email Summary:');
console.log(emailResponse.text);

console.log('\n✅ Gmail MCP Example completed successfully!');

// 8. Close Mastra-specific MCP client.
await mcpClient.disconnect();
