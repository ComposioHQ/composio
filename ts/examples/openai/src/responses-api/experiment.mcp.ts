import { Composio } from '@composio/core';
import { OpenAIResponsesProvider } from '@composio/openai';
import OpenAI from 'openai';
import 'dotenv/config';

// 1. Initialize Composio.
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new OpenAIResponsesProvider(),
  allowTracking: false,
});

const authConfigId = '<auth_config_id>'; // Use your auth config ID
const externalUserId = '<external_user_id>'; // Replace it with the user id from your database
const allowedTools = ['GMAIL_FETCH_EMAILS'];

// 2. Create an MCP config
const mcpConfig = await composio.mcp.create(`gmail-mcp-${Date.now()}`, {
  toolkits: [
    {
      toolkit: 'gmail',
      authConfigId,
    },
  ],
  allowedTools,
  manuallyManageConnections: true,
});

// 3. Retrieve the MCP server instance for the connected accounts
const mcp = await composio.mcp.generate(externalUserId, mcpConfig.id);

const tools = [
  {
    type: 'mcp' as const,
    server_label: mcp.name,
    server_url: mcp.url,
  },
];
console.log({ tools });

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
  tools: tools,
});

console.log(JSON.stringify(emailResponse, null, 2));

const result = await composio.provider.handleToolCalls('default', emailResponse.output);
console.log({ result });

const output = emailResponse.output.filter(({ type }) => type === 'message').at(0);

console.log(
  output?.type === 'message'
    ? output.content[0].type === 'output_text'
      ? output.content[0].text
      : '<refusal>'
    : '<unexpected response>'
);
