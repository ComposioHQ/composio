import { openai } from '@ai-sdk/openai';
import { createMCPClient } from "@ai-sdk/mcp"
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { stepCountIs, streamText } from 'ai';

// 1. Initialize Composio.
const composio = new Composio({
  provider: new VercelProvider(),
});

// 2. Create an MCP session
console.log('🔄 Creating toolrouter session...');
const session = await composio.create('jkomyno', {
  toolkits: ['gmail'], 
  manageConnections: true,
  tools: {
    'gmail': {
      enable: ['GMAIL_FETCH_EMAILS'],
    }
  }
});

const { mcp, sessionId } = session;

console.log(JSON.stringify(mcp, null, 2));
console.log(`✅ Toolrouter session created: ${sessionId}`);

// 3. Create an MCP client
console.log(`🔄 Connecting to MCP Server: ${mcp.url}`);
const mcpClient = await createMCPClient({
  transport: {
    type: 'http',
    url: mcp.url,
    headers: mcp.headers
  }
});

// 4. Retrieve tools.
console.log(`🔄 Retrieving tools...`);
const tools = await session.tools();
console.log(`✅ ${Object.values(tools).length} tools retrieved from ToolRouterSession`);
console.log(`🔎 Available tools: ${Object.keys(tools).join(', ')}`);

// 5. Pass tools to Vercel-specific Agent.
console.log(`🔄 Executing agent...`);
const stream = streamText({
  model: openai('gpt-4o-mini'),
  prompt: `Summarize my latest received email from gmail.`,
  stopWhen: stepCountIs(10),
  onStepFinish: (step) => {
    if (step.toolCalls.length > 0) {
      for (const toolCall of step.toolCalls) {
        console.log(`🔧 Executed ${toolCall.toolName}`);
      }
    }
  },
  tools,
});

// 6. Execute the Vercel AI-specific Agent.
console.log(`🤖 Agent Response:`);
for await (const textPart of stream.textStream) {
  process.stdout.write(textPart);
}

process.stdout.write('\n');

// 7. Close Vercel AI's MCP client.
await mcpClient.close();
