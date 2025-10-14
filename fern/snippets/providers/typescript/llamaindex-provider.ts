import { Composio } from '@composio/core';
import { LlamaindexProvider } from '@composio/llamaindex';
import { openai } from '@llamaindex/openai';
import { agent } from '@llamaindex/workflow';
import 'dotenv/config';

// Initialize Composio with LlamaIndex provider
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new LlamaindexProvider(),
});

async function main() {
  // Get tools
  const tools = await composio.tools.get('user@acme.com', {
    tools: ['GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER'],
  });

  // Create LlamaIndex agent with Composio tools
  const githubAgent = agent({
    name: 'GitHub Agent',
    description: 'An agent that performs GitHub actions',
    llm: openai({ model: 'gpt-4o-mini' }),
    systemPrompt: 'You are an agent that performs github actions.',
    tools,
  });

  // Run the agent
  const result = await githubAgent.run(
    'Hello! I would like to star a repo composiohq/composio on GitHub'
  );
  
  console.log(result);
}

main().catch(console.error);
