import { Composio } from '@composio/core';
import { OpenAIResponsesProvider, OpenAIProvider } from '@composio/openai';
import { OpenAI } from 'openai';

// Initialise Composio client with the OpenAI provider.
const composioForResponses = new Composio({ provider: new OpenAIResponsesProvider() });
const openai = new OpenAI();

const userId = 'your@example.com';
const toolsForResponses = await composioForResponses.tools.get(userId, {
  toolkits: ['HACKERNEWS'],
});

const response = await openai.responses.create({
  model: 'gpt-4.1',
  input: "What's the lates Hackernews post about?",
  tools: toolsForResponses,
});

const result = await composioForResponses.provider.handleResponse(userId, response);

console.log('RESPONSE API');
console.log(JSON.stringify(result, null, 2));
// will return the raw response from the HACKERNEWS API.

const composioForCompletions = new Composio({ provider: new OpenAIProvider() });
const toolsForCompletions = await composioForCompletions.tools.get(userId, {
  toolkits: ['HACKERNEWS'],
});

const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    {
      role: 'user',
      content: 'What is the latest hackernews post about?',
    },
  ],
  tools: toolsForCompletions,
});

const newResult = await composioForCompletions.provider.handleToolCalls(userId, completion);

console.log(JSON.stringify(newResult, null, 2));
// will return the raw response from the HACKERNEWS API.
