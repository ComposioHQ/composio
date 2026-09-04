import { Composio, normalizeToolArguments } from '@composio/core';
import { OpenAIProvider } from '@composio/openai';
import OpenAI from 'openai';

const MODEL = 'gpt-5-mini';
const USER_ID = 'example-user';
const MAX_STEPS = 10;

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
  const openai = new OpenAI({
    apiKey: openaiApiKey,
    maxRetries: 1,
    timeout: 60_000,
  });
  const composio = new Composio({
    apiKey: composioApiKey,
    provider: new OpenAIProvider(),
  });
  const session = await composio.sessions.create(USER_ID, {
    toolkits: ['hackernews'],
  });
  const tools = await session.tools();
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content:
        'You are a helpful assistant. Use the available Composio tools to search for and read HackerNews data before answering.',
    },
    {
      role: 'user',
      content: 'What are the current top 3 HackerNews stories? Give me their titles.',
    },
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

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== 'function') {
        throw new Error(`Unsupported OpenAI tool call type: ${toolCall.type}`);
      }

      const result = await session.execute(
        toolCall.function.name,
        normalizeToolArguments(toolCall.function.arguments, toolCall.function.name)
      );
      if (!result.error) {
        hasSuccessfulToolExecution = true;
      }
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error(`Agent exceeded the ${MAX_STEPS}-step tool-call budget.`);
}
