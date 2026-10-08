import { Composio } from '@composio/core';
import { LangchainProvider } from '@composio/langchain';
import { createAgent } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';

// initiate composio
const composio = new Composio({
  provider: new LangchainProvider(),
});

const userId = process.env.COMPOSIO_EXAMPLES_USER_ID; // the user id from your database
if (!userId) {
  throw new Error('Set COMPOSIO_EXAMPLES_USER_ID');
}

const gmailTool = await composio.tools.get(userId, 'GMAIL_FETCH_EMAILS');

const agent = createAgent({
  model: new ChatOpenAI({ model: 'gpt-5' }),
  tools: gmailTool,
});

console.log(
  await agent.invoke({
    messages: [{ role: 'user', content: 'Provide a summary of my last email received.' }],
  })
);
