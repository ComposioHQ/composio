import { Composio } from '@composio/core';
import { OpenAIAgentsProvider } from '@composio/openai-agents';
import { Agent, hostedMcpTool, run } from '@openai/agents';

async function main() {
  // Initialize Composio with OpenAI Agents Provider
  const composio = new Composio({
    apiKey: process.env.COMPOSIO_API_KEY,
    provider: new OpenAIAgentsProvider()
  });

  // Create a Tool Router session for your user
  const session = await composio.experimental.toolRouter.createSession(
    'user@example.com',
    {
      toolkits: ['gmail', 'github'] // Optional: Limit available toolkits
    }
  );

  // Create an agent with Tool Router MCP endpoint
  const agent = new Agent({
    name: 'Assistant',
    instructions: 'You are a helpful assistant that can access Gmail and GitHub. Help users fetch emails, create issues, manage pull requests, and more.',
    tools: [
      hostedMcpTool({
        serverLabel: 'tool_router',
        serverUrl: session.url,
      }),
    ],
  });

  // Execute the agent
  const result = await run(
    agent,
    'Fetch the contributors to composiohq/composio github repository and email the list to user@example.com'
  );

  console.log(result.finalOutput);
}

main();