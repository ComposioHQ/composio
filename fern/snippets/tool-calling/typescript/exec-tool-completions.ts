import { Composio } from '@composio/core';
import { AnthropicProvider } from '@composio/anthropic';
import { Anthropic } from '@anthropic-ai/sdk';

// Use a unique identifier for each user in your application
const userId = 'user-k7334';

// Create anthropic client
const anthropic = new Anthropic();

// Create Composio client
const composio = new Composio({
  apiKey: "your-composio-api-key",
  provider: new AnthropicProvider(),
});

// Get calendar tools for this user
const tools = await composio.tools.get(userId, {
  tools: ['GOOGLECALENDAR_EVENTS_LIST'],
});

const today = new Date();

// Ask the LLM to check calendar
const msg = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  tools: tools,
  messages: [
    {
      role: 'user',
      content: `What's on my calendar for the next 7 days starting today:${today.toLocaleDateString()}?`,
    },
  ],
  max_tokens: 1024,
});

// Handle tool calls
const result = await composio.provider.handleToolCalls(userId, msg);
console.log('Results:', JSON.stringify(result, null, 2));
