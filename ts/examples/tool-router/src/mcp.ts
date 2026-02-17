import { openai } from '@ai-sdk/openai';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { Composio } from '@composio/core';
import { stepCountIs, streamText } from 'ai';
import ora from 'ora';

const composio = new Composio();
const trProgress = ora("Creating tool router session...").start();
const { mcp } = await composio.create('default', {
  toolkits: ['gmail'], 
  manageConnections: true,
  tools: {
    'gmail': {
      enable: ['GMAIL_FETCH_EMAILS'],
    }
  }
});
trProgress.succeed(`Tool router session created: ${mcp.url}`);

const mcpProgress = ora("Retrieving tools from MCP...").start();
const client = await createMCPClient({
  transport: {
    type: 'http',
    url: mcp.url,
    headers: mcp.headers
  }
});

const tools = await client.tools();
mcpProgress.succeed(`${Object.values(tools).length} tools retrieved from MCP`);

console.log(`🤖 Waiting for agent response...`);
const stream = await streamText({
  model: openai('gpt-4o-mini'),
  prompt: 'Summarize my latest received email from gmail.',
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
