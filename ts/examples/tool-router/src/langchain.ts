import { MultiServerMCPClient } from "@langchain/mcp-adapters";  
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { Composio } from "@composio/core";

const composio = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY,
});

const llm = new ChatOpenAI({
  model: "gpt-4o",
})

async function main() {
  const session = await composio.experimental.create('user_123', { toolkits: ['gmail'] });

  const client = new MultiServerMCPClient({  
      math: {
          transport: "http",  
          url: session.mcp.url,
          headers: {
              'x-api-key': process.env.COMPOSIO_API_KEY!,
          }
      },
  });

  const tools = await client.getTools();  


  const agent = createAgent({
    name: "Gmail Assistant",
    systemPrompt: "You are a helpful gmail assistant.",
    model: llm,
    tools,  
  });

  const result = await agent.invoke({
    messages: [{ role: "user", content: "Fetch my last email from gmail" }],
  })

  console.log(result);
}

main();

