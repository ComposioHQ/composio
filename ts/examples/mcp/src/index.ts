import { createMCPClient } from '@ai-sdk/mcp';
import { openai } from '@ai-sdk/openai';
import { Composio, SessionPreset } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { stepCountIs, streamText } from 'ai';
import 'dotenv/config';

// 1. Initialize Composio.
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
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
  const serverParams = new StreamableHTTPClientTransport(new URL(session.mcp.url), {
    requestInit: { headers: session.mcp.headers },
  });

  const mcpClient = await createMCPClient({
    name: 'composio-mcp-client',
    transport: serverParams,
  });

  try {
    // 3. Retrieve tools.
    const tools = await mcpClient.tools();

    // 4. Pass tools to Vercel-specific Agent.
    const stream = streamText({
      model: openai('gpt-4o-mini'),
      messages: [
        {
          role: 'user',
          content: `Fetch the latest 2 emails and provide a detailed summary with sender, subject, date, and brief content overview for each email.`,
        },
      ],
      stopWhen: stepCountIs(5),
      tools,
    });

    // 5. Execute the Vercel AI-specific Agent.
    for await (const textPart of stream.textStream) {
      process.stdout.write(textPart);
    }
  } finally {
    await mcpClient.close();
  }
} finally {
  await session.delete();
}
