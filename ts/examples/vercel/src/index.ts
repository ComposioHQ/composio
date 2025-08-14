import { Composio } from '@composio/core';
import { generateText, CoreMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { VercelProvider } from '@composio/vercel';
import dotenv from 'dotenv';
import { MessageRoles } from './types';
dotenv.config();

/**
 * Initialize the Composio SDK with the Vercel provider
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

/**
 * Get the hacker news tool
 * Alternatively, you can use the `composio.getToolBySlug` method
 */
async function run() {
  const tools = await composio.tools.get('test-user-id', 'HACKERNEWS_GET_FRONTPAGE');

  const messages: CoreMessage[] = [
    {
      role: MessageRoles.USER,
      content: 'Summarize the front page of HackerNews',
    },
  ];

  const chatCompletion = async () => {
    const { text, toolCalls, toolResults } = await generateText({
      model: openai('gpt-4o-mini'),
      tools: tools,
      messages,
    });

    if (toolResults.length > 0 && toolCalls.length > 0) {
      toolCalls.forEach(async toolCall => {
        console.log(`Executing tool call: ${toolCall.toolName}`);
      });

      messages.push({
        role: MessageRoles.ASSISTANT,
        content: toolCalls,
      });

      messages.push({
        role: MessageRoles.TOOL,
        content: toolResults,
      });

      await chatCompletion();
    } else {
      messages.push({ role: MessageRoles.ASSISTANT, content: text });
      console.log(`Assistant: ${text}\n`);
    }
  };

  chatCompletion();
}

run();
