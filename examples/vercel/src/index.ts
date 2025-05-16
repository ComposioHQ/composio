import { Composio } from '@composio/core';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { VercelToolset } from '@composio/vercel';
import dotenv from 'dotenv';
import { Message, MessageRoles } from './types';
dotenv.config();

/**
 * Initialize the Composio SDK with the Vercel toolset
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  toolset: new VercelToolset(),
});

/**
 * Get the hacker news tool
 * Alternatively, you can use the `composio.getToolBySlug` method
 */
async function run() {
  const hackerNewsTool = await composio.tools.get('test-user-id', 'HACKERNEWS_GET_FRONTPAGE');

  const messages: Message[] = [
    {
      role: MessageRoles.USER,
      content: 'Summarize the front page of HackerNews',
    },
  ];

  const chatCompletion = async () => {
    const { text, toolCalls, toolResults } = await generateText({
      model: openai('gpt-4o-mini'),
      tools: { ['HACKERNEWS_GET_FRONTPAGE']: hackerNewsTool },
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
