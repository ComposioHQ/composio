import { openai } from '@ai-sdk/openai';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { stepCountIs, streamText } from 'ai';
import ora from 'ora';

const composio = new Composio({
  provider: new VercelProvider(),
});
const trProgress = ora("Creating tool router session...").start();
const { mcp } = await composio.experimental.create('dhawal', { toolkits: ['gmail'], manageConnections: true });
trProgress.succeed(`Tool router session created: ${mcp.url}`);

const mcpProgress = ora("Retrieving tools from MCP...").start();
const client = await createMCPClient({
  transport: {
    type: 'http',
    url: mcp.url,
    headers: {
      'x-api-key': process.env.COMPOSIO_API_KEY!,
    }
  }
});

const tools = await client.tools();
mcpProgress.succeed(`${Object.values(tools).length} tools retrieved from MCP`);

console.log(`🤖 Waiting for agent response...`);
const stream = await streamText({
  model: openai('gpt-4o-mini'),
  prompt: 'Find my last email from gmail?',
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

for await (const textPart of stream.textStream) {
  process.stdout.write(textPart);
}
