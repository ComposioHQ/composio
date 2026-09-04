import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai';
import OpenAI from 'openai';

const MODEL = 'gpt-5-mini';
const USER_ID = 'example-user';
const MAX_STEPS = 10;

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
  const openai = new OpenAI({
    apiKey: openaiApiKey,
    maxRetries: 1,
    timeout: 60_000,
  });
  const composio = new Composio({
    apiKey: composioApiKey,
    provider: new OpenAIProvider(),
  });
  const tools = await composio.tools.get(USER_ID, 'HACKERNEWS_GET_USER_BY_USERNAME');
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: 'You are a helpful assistant that looks up HackerNews users.',
    },
    { role: 'user', content: 'Tell me about the HackerNews user `pg`.' },
  ];
  let hasSuccessfulToolExecution = false;

  for (let step = 0; step < MAX_STEPS; step += 1) {
    let toolChoice: 'auto' | 'required' = 'auto';
    if (!hasSuccessfulToolExecution) {
      toolChoice = 'required';
    }

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools,
      tool_choice: toolChoice,
    });
    const message = response.choices[0]?.message;
    if (!message) {
      throw new Error('OpenAI returned no assistant message.');
    }

    messages.push(message);
    if (!message.tool_calls?.length) {
      if (!hasSuccessfulToolExecution) {
        throw new Error('Agent returned without successfully executing a Composio tool.');
      }

      const text = message.content?.trim();
      if (!text) {
        throw new Error('Agent returned empty output — expected a non-empty response.');
      }
      return text;
    }

    const toolMessages = await composio.provider.handleToolCalls(USER_ID, response, undefined, {
      beforeExecute: ({ toolSlug, params }) => {
        console.log(`🔧 executing ${toolSlug} with ${JSON.stringify(params.arguments)}`);
        return params;
      },
      afterExecute: ({ toolSlug, result }) => {
        if (result.successful) {
          hasSuccessfulToolExecution = true;
        }
        console.log(`✅ ${toolSlug} finished`);
        return result;
      },
    });
    messages.push(...toolMessages);
  }

  throw new Error(`Agent exceeded the ${MAX_STEPS}-step tool-call budget.`);
}
