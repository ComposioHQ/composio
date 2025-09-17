import { create as createComposio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';
import { MCPClient as MastraMCPClient } from '@mastra/mcp';
import Anthropic from '@anthropic-ai/sdk';
import zodToJsonSchema from 'zod-to-json-schema';

async function wrapTools(servers: Record<string, any>, tools: Record<string, any>) {
  const prefixes = Object.keys(servers);

  function removePrefix(str: string): string {
    for (const prefix of prefixes) {
      if (str.startsWith(prefix)) {
        return str.slice(prefix.length + 1);
      }
    }
    return str;
  }

  return Object.entries(tools).map(([key, tool]) => {
    const inputSchema = zodToJsonSchema(tool.inputSchema);
    return {
      name: removePrefix(key),
      description: tool.description,
      input_schema: {
        ...inputSchema,
        type: 'object' as const,
      },
      type: 'custom' as const,
    };
  });
}

// 1. Initialize Composio.
const composio = createComposio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new AnthropicProvider({ cacheTools: true }),
  experimental: {
    mcp: true,
  },
});

const authConfigId = '<auth_config_id>'; // Use your auth config ID
const connectedAccountId = '<connected_account_id>'; // Replace it with the connected account id
const allowedTools = ['GMAIL_FETCH_EMAILS'];

// 2. Create an MCP config
const mcpConfig = await composio.mcpConfig.create(
  `${Date.now()}`,
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

// 4. Create a Mastra-specific MCP client.
//    This client needs to remain "alive" not be dropped by the GC until
//    the tools are retrieved from it.
const mcpClient = new MastraMCPClient({
  servers,
});

// 5. Retrieve tools.
const tools = await mcpClient.getTools();
console.log(`✅ Tools available: ${Object.keys(tools)}\n`);

// 6. Initialize Anthropic client.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// 7. Pass tools to Anthropic-specific Agent.
const stream = anthropic.messages.stream({
  model: 'claude-4-sonnet-20250514',
  max_tokens: 64_000,
  messages: [
    {
      role: 'user',
      content:
        'Please fetch the latest 2 emails and provide a detailed summary with sender, subject, date, and brief content overview for each email. Format the response in a clear, organized way.',
    },
  ],
  tools: await wrapTools(servers, tools),
});

console.log('\n📬 Email Summary:');
for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    process.stdout.write(event.delta.text);
  }
}
process.stdout.write('\n');

// 9. Close Mastra-specific MCP client.
await mcpClient.disconnect();

console.log('\n✅ Anthropic MCP Example completed successfully!');
