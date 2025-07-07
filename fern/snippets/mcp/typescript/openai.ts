import { Composio } from '@composio/core';
import { OpenAIResponsesProvider } from '@composio/openai';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new OpenAIResponsesProvider(),
});

const mcpConfig = await composio.mcp.create(
  'gmail-mcp',
  [
    {
      toolkit: 'GMAIL',
      allowedTools: ['GMAIL_FETCH_EMAILS'],
      authConfigId: 'ac_GHetipM5x5s0',
    },
  ],
  { useComposioManagedAuth: true }
);

console.log(`✅ MCP server created: ${mcpConfig.id}`);
console.log(`🔧 Available toolkits: ${mcpConfig.toolkits.join(', ')}`);

// Retrieve server URLs for connected accounts
const mcpTools = await mcpConfig.getServer({
  userId: "sid"
});

console.log('MCP Tools:', mcpTools);

const completion = await openai.responses.create({
  model: 'gpt-4o-mini',
  input:
    "I've connected to Gmail and I want to fetch the latest email from my inbox and summarize it",
  tools: mcpTools,
});

console.log('\n📬 Email Summary:');
console.log(completion.output_text);

console.log('\n✅ OpenAI MCP example completed successfully!');
console.log(
  '\n💡 Note: The MCP server URLs can also be used to connect from other MCP-compatible clients.'
);
console.log(`📍 Server ID for future reference: ${mcpConfig.id}`);
