import { Composio } from '@composio/core';
import { generateText, ModelMessage, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { VercelProvider } from '@composio/vercel';
import { MessageRoles } from './types';

/**
 * Initialize the Composio SDK with the Vercel provider
 */
const composio = new Composio({
  provider: new VercelProvider(),
});

/**
 * Get the hacker news tool
 * Alternatively, you can use the `composio.getToolBySlug` method
 */
async function run() {
  const tools = await composio.tools.get('test-user-id', 'HACKERNEWS_GET_USER', {
    beforeExecute: ({ params, toolSlug }) => {
      console.log(`🔄 Executing ${toolSlug} with params:`, { params });
      return params;
    },
    afterExecute: ({ result, toolSlug }) => {
      console.log(`✅ Executed ${toolSlug} with result:`, { result });
      return result;
    },
  });

  const messages: ModelMessage[] = [
    {
      role: MessageRoles.USER,
      content: 'Who is the user "pg" on hackernews?',
    },
  ];

  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    tools,
    messages,
    stopWhen: stepCountIs(5),
  });

  console.log(text);
}

run();
