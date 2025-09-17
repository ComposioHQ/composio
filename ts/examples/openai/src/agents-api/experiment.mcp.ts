import { create as createComposio } from '@composio/core';
import { OpenAIAgentsProvider } from '@composio/openai-agents';
import { Agent as OpenAIAgent, run } from '@openai/agents';
import type { HostedMCPTool } from '@openai/agents';
import 'dotenv/config';

function sanitizeString(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function wrapTools<T>(servers: Array<HostedMCPTool<T>>): Array<HostedMCPTool<T>> {
  return servers.map(server => {
    const { server_label, ...rest } = server.providerData ?? {};
    return {
      ...server,
      providerData: {
        ...rest,
        /**
         * 'server_label' must start with a letter and consist of only letters, digits, '-' and '_'
         */
        server_label: sanitizeString(server_label),
      },
    }
  })
}

// 1. Initialize Composio.
const composio = createComposio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new OpenAIAgentsProvider(),
  experimental: {
    mcp: true,
  },
});

const authConfigId = '<auth_config_id>'; // Use your auth config ID
const connectedAccountId = '<connected_account_id>'; // Replace it with the connected account id
const allowedTools = ['GMAIL_FETCH_EMAILS'];

// 2. Create an MCP config
const mcpConfig = await composio.mcpConfig.create(
  `gmail-mcp-${Date.now()}`,
  [
    {
      authConfigId,
      allowedTools,
    },
  ],
  { isChatAuth: true }
);

// 3. Retrieve the MCP server instance for the connected accounts
const servers = await composio.mcp.experimental.getServer(mcpConfig.id, connectedAccountId, {
  limitTools: allowedTools,
});

// 4. Pass tools to OpenAI-specific Agent.
const agent = new OpenAIAgent({
  name: 'Gmail Assistant',
  instructions: `
    You are a helpful Gmail assistant that fetches and summarizes emails.
    When fetching emails, provide a clear summary of the results including sender, subject, and date.
    Be concise and provide actionable information based on the email content.
  `,
  model: 'gpt-4o-mini',
  tools: wrapTools(servers),
});

// 5. Execute the OpenAI-specific agent.
// Fetch and summarize recent emails
console.log('\n=== Fetching and Summarizing Recent Emails ===');
const emailResponse = await run(
  agent,
  'Fetch the latest 2 emails and provide a detailed summary with sender, subject, date, and brief content overview for each email'
);
console.log('\n📬 Email Summary:');

const output = emailResponse.output.filter(({ type }) => type === 'message').at(0);

// @ts-ignore
console.log(output?.content[0].text);
