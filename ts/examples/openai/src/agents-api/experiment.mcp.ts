import { Composio } from '@composio/core';
import { OpenAIAgentsProvider } from '@composio/openai-agents';
import { hostedMcpTool, Agent as OpenAIAgent, run } from '@openai/agents';
import type { HostedMCPTool } from '@openai/agents';
import 'dotenv/config';

// 1. Initialize Composio.
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new OpenAIAgentsProvider(),
  allowTracking: false,
});

const authConfigId = '<auth_config_id>'; // Use your auth config ID
const toolkit = 'gmail'; // slug of the toolkit
const externalUserId = '<external_user_id>'; // Replace it with the userId from your database
const allowedTools = ['GMAIL_FETCH_EMAILS'];

// 2. Create an MCP config
const mcpConfig = await composio.experimental.mcp.create(externalUserId, {
  toolkits: [
    { toolkit, authConfigId, allowedTools }
  ],
});

// 3. Retrieve the MCP server instance for the connected accounts
const server = await composio.experimental.mcp.generate(externalUserId, mcpConfig.id);

const tools: HostedMCPTool[] = [
  hostedMcpTool({
    serverLabel: server.name,
    serverUrl: server.url,
    requireApproval: {
      never: {
        toolNames: ['GMAIL_FETCH_EMAILS'],
      },
    },
  }),
];

// 4. Pass tools to OpenAI-specific Agent.
const agent = new OpenAIAgent({
  name: 'Gmail Assistant',
  instructions: `
    You are a helpful Gmail assistant that fetches and summarizes emails.
    When fetching emails, provide a clear summary of the results including sender, subject, and date.
    Be concise and provide actionable information based on the email content.
  `,
  model: 'gpt-4o-mini',
  tools: tools,
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
