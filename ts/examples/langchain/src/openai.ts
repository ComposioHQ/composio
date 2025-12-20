import { Composio } from '@composio/core';
import { LangchainProvider } from '@composio/langchain';
import { createAgent } from "langchain";
import { ChatOpenAI } from '@langchain/openai';

// initiate composio
const composio = new Composio({
  provider: new LangchainProvider(),
});

const githubTool = await composio.tools.get('jkomyno', 'GMAIL_FETCH_EMAILS');

const agent = createAgent({
    model: new ChatOpenAI({ model: "gpt-5" }),
    tools: githubTool,
  });
  
  console.log(
    await agent.invoke({
      messages: [{ role: "user", content: "Provide a summary of my last email received." }],
    })
  );