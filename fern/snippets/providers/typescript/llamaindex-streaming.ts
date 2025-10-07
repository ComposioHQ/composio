import { Composio } from '@composio/core';
import { LlamaindexProvider } from '@composio/llamaindex';
import { openai } from '@llamaindex/openai';
import { agent, agentStreamEvent } from '@llamaindex/workflow';
import 'dotenv/config';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new LlamaindexProvider(),
});

async function streamingExample() {
  // Get tools from multiple toolkits with execution modifiers
  const tools = await composio.tools.get(
    'default',
    {
      toolkits: ['gmail', 'googlecalendar', 'slack'],
      limit: 20,
    },
    {
      beforeExecute: ({ toolSlug, params }) => {
        console.log(`🔄 Executing ${toolSlug} with:`, params);
        return params;
      },
      afterExecute: ({ toolSlug, result }) => {
        console.log(`✅ ${toolSlug} completed:`, result);
        return result;
      },
    }
  );

  // Create streaming agent
  const assistantAgent = agent({
    name: 'Personal Assistant',
    description: 'A helpful personal assistant',
    llm: openai({ model: 'gpt-4o-mini' }),
    systemPrompt: 'You are a helpful personal assistant that can manage emails, calendar events, and slack messages.',
    tools,
  });

  // Stream the response
  const stream = await assistantAgent.runStream(
    'Schedule a meeting for tomorrow at 2 PM and send a slack message about it'
  );

  for await (const event of stream) {
    if (agentStreamEvent.include(event)) {
      process.stdout.write(event.data.delta);
    }
  }
}

streamingExample().catch(console.error);
