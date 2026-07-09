import { createOpenAI } from '@ai-sdk/openai';
import { Composio } from '@composio/core';
import { MastraProvider } from '@composio/mastra';
import { Agent } from '@mastra/core/agent';
import { stepCountIs } from 'ai';

export interface HackerNewsAgentEnvironment {
  COMPOSIO_API_KEY?: string;
  OPENAI_API_KEY?: string;
}

type HackerNewsAgentMode = 'direct' | 'tool-router';

function requireKey(
  env: HackerNewsAgentEnvironment,
  name: keyof HackerNewsAgentEnvironment
): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required to run the HackerNews agent.`);
  }

  return value;
}

export async function runHackerNewsAgent(
  env: HackerNewsAgentEnvironment,
  mode: HackerNewsAgentMode
): Promise<string> {
  const composioApiKey = requireKey(env, 'COMPOSIO_API_KEY');
  const openaiApiKey = requireKey(env, 'OPENAI_API_KEY');
  const composio = new Composio({
    apiKey: composioApiKey,
    provider: new MastraProvider(),
  });

  const tools =
    mode === 'direct'
      ? await composio.tools.get('default', 'HACKERNEWS_GET_USER_BY_USERNAME', {
          beforeExecute: ({ toolSlug, params }) => {
            console.log(`🔧 executing ${toolSlug} with ${JSON.stringify(params.arguments)}`);
            return params;
          },
          afterExecute: ({ toolSlug, result }) => {
            console.log(`✅ ${toolSlug} finished`);
            return result;
          },
        })
      : await (
          await composio.sessions.create('example-user', {
            toolkits: ['hackernews'],
          })
        ).tools();

  const isDirect = mode === 'direct';
  const openai = createOpenAI({
    apiKey: openaiApiKey,
  });
  const agent = new Agent({
    id: isDirect ? 'hackernews-agent' : 'hackernews-router-agent',
    name: isDirect ? 'HackerNews Agent' : 'HackerNews Router Agent',
    instructions: isDirect
      ? 'You are a helpful assistant that looks up HackerNews users.'
      : 'You are a helpful assistant. Use the available Composio tools to search for and read HackerNews data before answering.',
    model: openai('gpt-5-mini'),
    tools,
  });

  const prompt = isDirect
    ? 'Tell me about the HackerNews user `pg`.'
    : 'What are the current top 3 HackerNews stories? Give me their titles.';
  const { text } = await agent.generate([{ role: 'user', content: prompt }], {
    stopWhen: stepCountIs(10),
  });

  if (!text || text.trim().length === 0) {
    throw new Error('Agent returned empty output — expected a non-empty response.');
  }

  return text;
}
