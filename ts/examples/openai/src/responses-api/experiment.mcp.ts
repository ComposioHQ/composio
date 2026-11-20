import { Composio, SessionPreset } from '@composio/core';
import { OpenAIResponsesProvider } from '@composio/openai';
import OpenAI from 'openai';
import 'dotenv/config';

// 1. Initialize Composio.
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new OpenAIResponsesProvider(),
  allowTracking: false,
});

const authConfigId = process.env.COMPOSIO_EXAMPLES_GMAIL_AUTH_CONFIG_ID; // your Gmail auth config ID
const externalUserId = process.env.COMPOSIO_EXAMPLES_USER_ID; // the user id from your database
if (!authConfigId || !externalUserId) {
  throw new Error('Set COMPOSIO_EXAMPLES_GMAIL_AUTH_CONFIG_ID and COMPOSIO_EXAMPLES_USER_ID');
}
const allowedTools = ['GMAIL_FETCH_EMAILS'];

// 2. Create an MCP session that exposes only the example's Gmail tool.
const session = await composio.sessions.create(externalUserId, {
  authConfigs: { gmail: authConfigId },
  toolkits: ['gmail'],
  tools: { gmail: { enable: allowedTools } },
  sessionPreset: SessionPreset.DIRECT_TOOLS,
  mcp: true,
});

try {
  const tools = [
    {
      type: 'mcp' as const,
      server_label: 'composio',
      server_url: session.mcp.url,
      headers: session.mcp.headers,
    },
  ];

  // 3. Pass tools to OpenAI-specific Agent.
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
} finally {
  await session.delete();
}
