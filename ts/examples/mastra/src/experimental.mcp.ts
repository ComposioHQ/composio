import { openai } from '@ai-sdk/openai';
import { create as createComposio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';
import { MCPClient as MastraMCPClient } from '@mastra/mcp';
import { Agent as MastraAgent } from '@mastra/core/agent';

function wrapTools(servers: Record<string, any>, tools: Record<string, any>): Record<string, any> {
  const prefixes = Object.keys(servers);

  function removePrefix(str: string): string {
    for (const prefix of prefixes) {
      if (str.startsWith(prefix)) {
        return str.slice(prefix.length + 1);
      }
    }
    return str;
  }

  return Object.fromEntries(
    Object.entries(tools).map(([key, tool]) => {
      return [
        removePrefix(key),
        tool,
      ] as const
    })
  );
}

// 1. Initialize Composio.
const composio = createComposio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new MastraProvider(),
  experimental: {
    mcp: true,
  },
});

const authConfigId = 'ac_uINV_uCV87lm';
const email = 'alberto.schiabel@gmail.com';
const allowedTools = ['GMAIL_FETCH_EMAILS'];

// 2. Create an MCP config
const mcpConfig = await composio.mcpConfig.create(
  `${Date.now()}`,
  [
    {
      // https://platform.composio.dev/alberto_schiabel/2025-09-12/auth-configs/ac_uINV_uCV87lm
      authConfigId,
      allowedTools,
    },
  ],
  { isChatAuth: true }
);

// 3. Retrieve the MCP server instance for the connected accounts
const servers = await composio.mcp.experimental.getServer(mcpConfig.id, email, {
  limitTools: allowedTools,
});

// 4. Create a Mastra-specific MCP client.
//    This client needs to remain "alive" not be dropped by the GC until
//    the tools are retrieved from it.
const mcpClient = new MastraMCPClient({
  servers,
});

// 5. Retrieve tools.
const tools = await mcpClient.getTools();

// 6. Pass tools to Mastra-specific Agent.
const agent = new MastraAgent({
  name: 'Gmail Assistant',
  instructions: `
    You are a helpful Gmail assistant that fetches and summarizes emails.
    When fetching emails, provide a clear summary of the results including sender, subject, and date.
    Be concise and provide actionable information based on the email content.
  `,
  model: openai('gpt-4o-mini'),
  tools: wrapTools(servers, tools),
});

// Fetch and summarize recent emails.
// Note: I reduced the number of emails to analyze from 10 to 2 due to the context length limit of the model.
// Before, I was getting the following error:
// ```
// This model's maximum context length is 128000 tokens. However, your messages resulted in 209586 tokens
// (208563 in the messages, 1023 in the functions). Please reduce the length of the messages or functions.
// ```
console.log('\n=== Fetching and Summarizing Recent Emails ===');
const emailResponse = await agent.generate(
  'Fetch the latest 2 emails and provide a detailed summary with sender, subject, date, and brief content overview for each email'
);
console.log('\n📬 Email Summary:');
console.log(emailResponse.text);

console.log('\n✅ Gmail MCP Example completed successfully!');

// 8. Close Mastra-specific MCP client.
await mcpClient.disconnect();
