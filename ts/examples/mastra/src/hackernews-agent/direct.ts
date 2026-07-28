import { createOpenAI } from '@ai-sdk/openai';
import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';
import { Agent } from '@mastra/core/agent';
import { stepCountIs } from 'ai';

interface DirectHackerNewsAgentEnvironment {
  COMPOSIO_API_KEY?: string;
  OPENAI_API_KEY?: string;
}

function requireKey(
  env: DirectHackerNewsAgentEnvironment,
  name: keyof DirectHackerNewsAgentEnvironment
): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required to run the HackerNews agent.`);
  }

  return value;
}

export async function runDirectHackerNewsAgent(
  env: DirectHackerNewsAgentEnvironment
): Promise<string> {
  const composioApiKey = requireKey(env, 'COMPOSIO_API_KEY');
  const openaiApiKey = requireKey(env, 'OPENAI_API_KEY');
  const composio = new Composio({
    apiKey: composioApiKey,
    provider: new MastraProvider(),
  });
  const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER_BY_USERNAME', {
    beforeExecute: ({ toolSlug, params }) => {
      console.log(`🔧 executing ${toolSlug} with ${JSON.stringify(params.arguments)}`);
      return params;
    },
    afterExecute: ({ toolSlug, result }) => {
      console.log(`✅ ${toolSlug} finished`);
      return result;
    },
  });
  const openai = createOpenAI({
    apiKey: openaiApiKey,
  });
  const agent = new Agent({
    id: 'hackernews-agent',
    name: 'HackerNews Agent',
    instructions: 'You are a helpful assistant that looks up HackerNews users.',
    model: openai('gpt-5-mini'),
    tools,
  });

  const { text } = await agent.generate(
    [{ role: 'user', content: 'Tell me about the HackerNews user `pg`.' }],
    {
      stopWhen: stepCountIs(10),
    }
  );

  if (!text || text.trim().length === 0) {
    throw new Error('Agent returned empty output — expected a non-empty response.');
  }

  return text;
}
