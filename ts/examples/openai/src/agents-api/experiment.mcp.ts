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

const authConfigId = process.env.COMPOSIO_EXAMPLES_GMAIL_AUTH_CONFIG_ID; // your Gmail auth config ID
const toolkit = 'gmail'; // slug of the toolkit
const externalUserId = process.env.COMPOSIO_EXAMPLES_USER_ID; // the userId from your database
if (!authConfigId || !externalUserId) {
  throw new Error('Set COMPOSIO_EXAMPLES_GMAIL_AUTH_CONFIG_ID and COMPOSIO_EXAMPLES_USER_ID');
}
const allowedTools = ['GMAIL_FETCH_EMAILS'];

// 2. Create an MCP config (names must be unique within a project)
const mcpConfig = await composio.mcp.create(`examples-gm-agents-${Math.floor(Date.now() / 1000)}`, {
  toolkits: [{ toolkit, authConfigId }],
  allowedTools,
});

// 3. Retrieve the MCP server instance for the connected accounts
const server = await composio.mcp.generate(externalUserId, mcpConfig.id);

const tools: HostedMCPTool[] = [
  hostedMcpTool({
    serverLabel: server.name,
    serverUrl: server.url,
    // The MCP endpoint authenticates with your Composio API key
    headers: { 'x-api-key': process.env.COMPOSIO_API_KEY! },
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

// @ts-expect-error: the agents SDK types `output` as a union whose message variant is not narrowed by the `type` filter above
console.log(output?.content[0].text);
