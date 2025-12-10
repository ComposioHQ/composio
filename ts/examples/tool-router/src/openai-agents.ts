import { Agent, run, hostedMcpTool } from '@openai/agents';
import { Composio } from '@composio/core';

const composio = new Composio();

const session = await composio.experimental.create('user_123', { toolkits: ['gmail'] });

console.log(`Tool Router Session Created: ${session.sessionId}`);
console.log(`Connecting to MCP server: ${session.mcp.url}`);

const mcpTool = hostedMcpTool({
  serverLabel: 'ComposioApps',
  serverUrl: session.mcp.url,
  headers: session.mcp.headers
});


const agent = new Agent({
  name: 'Gmail Assistant',
  instructions: 'You are a helpful gmail assistant.',
  tools: [mcpTool],
});

const result = await run(agent, 'Summarize my last email from gmail', {
  stream: true,
});


const stream = result.toStream();

for await (const event of stream) {
  if (event.type === 'raw_model_stream_event' && event.data.delta) {
    process.stdout.write(event.data.delta);
  }
}