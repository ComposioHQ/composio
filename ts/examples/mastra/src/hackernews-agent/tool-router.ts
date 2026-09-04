import { createOpenAI } from '@ai-sdk/openai';
import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';
import { Agent } from '@mastra/core/agent';
import { stepCountIs } from 'ai';

export interface ToolRouterHackerNewsAgentEnvironment {
  COMPOSIO_API_KEY?: string;
  OPENAI_API_KEY?: string;
}

function requireKey(
  env: ToolRouterHackerNewsAgentEnvironment,
  name: keyof ToolRouterHackerNewsAgentEnvironment
): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required to run the HackerNews agent.`);
  }

  return value;
}

export async function runToolRouterHackerNewsAgent(
  env: ToolRouterHackerNewsAgentEnvironment
): Promise<string> {
  const composioApiKey = requireKey(env, 'COMPOSIO_API_KEY');
  const openaiApiKey = requireKey(env, 'OPENAI_API_KEY');
  const composio = new Composio({
    apiKey: composioApiKey,
    provider: new MastraProvider(),
  });
  const session = await composio.sessions.create('example-user', {
    toolkits: ['hackernews'],
  });
  const tools = await session.tools();
  const openai = createOpenAI({
    apiKey: openaiApiKey,
  });
  const agent = new Agent({
    id: 'hackernews-router-agent',
    name: 'HackerNews Router Agent',
    instructions:
      'You are a helpful assistant. Use the available Composio tools to search for and read HackerNews data before answering.',
    model: openai('gpt-5-mini'),
    tools,
  });

  const { text } = await agent.generate(
    [
      {
        role: 'user',
        content: 'What are the current top 3 HackerNews stories? Give me their titles.',
      },
    ],
    {
      stopWhen: stepCountIs(10),
    }
  );

  if (!text || text.trim().length === 0) {
    throw new Error('Agent returned empty output — expected a non-empty response.');
  }

  return text;
}
