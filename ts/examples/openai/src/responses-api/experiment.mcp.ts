import { create as createComposio } from '@composio/core';
import { OpenAIResponsesProvider } from '@composio/openai';
import OpenAI from 'openai';
import 'dotenv/config';

function sanitizeString(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function wrapTools(servers: Array<OpenAI.Responses.Tool.Mcp>): Array<OpenAI.Responses.Tool.Mcp> {
  return servers.map(server => {
    const { server_label, ...rest } = server;
    return {
      ...rest,
      /**
       * 'server_label' must start with a letter and consist of only letters, digits, '-' and '_'
       */
      server_label: sanitizeString(server_label),
    }
  })
}

// 1. Initialize Composio.
const composio = createComposio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new OpenAIResponsesProvider(),
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
const openai = new OpenAI();
const emailResponse = await openai.responses.create({
  model: 'gpt-4o-mini',
  instructions: `
    You are a helpful Gmail assistant that fetches and summarizes emails.
    When fetching emails, provide a clear summary of the results including sender, subject, and date.
    Be concise and provide actionable information based on the email content.
  `,
  input: `Fetch the latest 2 emails and provide a detailed summary with sender, subject, date, and brief content overview for each email.`,
  tools: wrapTools(servers),
});

const output = emailResponse.output.filter(({ type }) => type === 'message').at(0);

console.log(output?.type === 'message'
  ? output.content[0].type === 'output_text'
    ? output.content[0].text
    : '<refusal>'
  : '<unexpected response>'
);
