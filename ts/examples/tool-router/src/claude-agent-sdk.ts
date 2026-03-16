import { query } from "@anthropic-ai/claude-agent-sdk";
import { Composio } from '@composio/core';
import 'dotenv/config';

const composio = new Composio();

const session = await composio.create('user_123', { toolkits: ['gmail'] });

const stream = await query({
  prompt: 'Use composio tools to fetch my last email from gmail',
  options: {
    model: 'claude-sonnet-4-5-20250929',
    permissionMode: "bypassPermissions",
    mcpServers: {
      composio: {
        type: 'http',
        url: session.mcp.url,
        headers: session.mcp.headers
      }
    },
    
  }
});

for await (const event of stream) {
  if (event.type === "result" && event.subtype === "success") {
    process.stdout.write(event.result);
  }
}