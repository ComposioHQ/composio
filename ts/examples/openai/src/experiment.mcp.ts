import { create as createComposio } from '@composio/core';
import OpenAI from 'openai';
import { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import 'dotenv/config';

function sanitizeString(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

async function wrapTools(client: MCPClient): Promise<Array<OpenAI.ChatCompletionFunctionTool>> {
  async function* listAllTools(client: MCPClient, maxTools = 128) {
    let cursor: string | undefined = undefined;
    let numTools = 0;
    while (numTools < maxTools) {
      const t = await client.listTools({cursor});
      for (const tool of t.tools) {
        yield tool;
        numTools++;
      }
      if (!t.nextCursor) {
        break;
      }
      cursor = t.nextCursor;
    }
  }

  const tools = await Array.fromAsync(listAllTools(client));

  return tools.map(tool => {
    return {
      type: 'function',
      function: {
        name: sanitizeString(tool.name),
        description: tool.description!,
        parameters: tool.inputSchema,
        strict: false,
      }
    }
  })
}

// 1. Initialize Composio.
const composio = createComposio({
  apiKey: process.env.COMPOSIO_API_KEY,
  experimental: {
    mcp: true,
  },
});

const authConfigId = 'ac_uINV_uCV87lm';
const connectedAccountId = 'ca_WSQrf8EWVuCq';
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
const url = await composio.mcp.experimental.getServer(mcpConfig.id, connectedAccountId, {
  limitTools: allowedTools,
});

// 4. Create a generic MCP client.
//    This client needs to remain "alive" not be dropped by the GC until
//    the tools are retrieved from it.
const serverParams = new SSEClientTransport(url);
const mcpClient = new MCPClient({
  name: 'composio-mcp-client',
  version: '1.0.0',
});

// 5. Retrieve tools.
await mcpClient.connect(serverParams);
const tools = await wrapTools(mcpClient);
console.dir(tools, { depth: null });
console.log(`✅ Tools available: ${tools.map(t => t.function.name).join(', ')}\n`);

// 6. Pass tools to OpenAI-specific Agent.
const openai = new OpenAI();
const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    {
      role: 'system',
      content: `
        You are a helpful Gmail assistant that fetches and summarizes emails.
        When fetching emails, provide a clear summary of the results including sender, subject, and date.
        Be concise and provide actionable information based on the email content.
      `,
    },
    {
      role: 'user',
      content: `Fetch the latest 2 emails and provide a detailed summary with sender, subject, date, and brief content overview for each email.`,
    }
  ],
  tools,
  tool_choice: 'auto',
});

/**
 * If the assistant has tool calls, execute them and log the result
 */
if (
  response.choices[0].message.tool_calls &&
  response.choices[0].message.tool_calls[0].type === 'function'
) {
  console.log(JSON.stringify(response, null, 2));
  const toolCall = response.choices[0].message.tool_calls[0];
  if (toolCall.type === 'function') {
    console.log(`✅ Calling tool ${response.choices[0].message.tool_calls[0].function.name}`);
  }
  const result = await composio.provider.handleToolCalls('default', response);
  console.log(result);
}

await mcpClient.close();

console.log('\n✅ OpenAI MCP Example completed successfully!');
