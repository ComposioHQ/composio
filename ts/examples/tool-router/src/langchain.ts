import { Composio } from '@composio/core';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const llm = new ChatOpenAI({
  model: 'gpt-4o',
});

async function main() {
  const userId = process.env.COMPOSIO_EXAMPLES_USER_ID; // a user with a connected Gmail account
  if (!userId) {
    throw new Error('Set COMPOSIO_EXAMPLES_USER_ID');
  }

  const session = await composio.create(userId, { toolkits: ['gmail'], mcp: true });

  const client = new MultiServerMCPClient({
    composio: {
      transport: 'http',
      url: session.mcp.url,
      headers: session.mcp.headers,
    },
  });

  const tools = await client.getTools();

  const agent = createAgent({
    name: 'gmail-assistant',
    systemPrompt: 'You are a helpful gmail assistant.',
    model: llm,
    tools,
  });

  const result = await agent.invoke({
    messages: [{ role: 'user', content: 'Fetch my last email from gmail' }],
  });

  console.log(result);
}

main();
