import { Composio } from '@composio/core';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { VercelProvider } from '@composio/vercel';
import { v4 as uuidv4 } from 'uuid';

const userId = uuidv4(); // The user's ID.
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

const addDescription = ({ toolSlug, toolkitSlug, schema }) => {
  if (toolSlug === 'GITHUB_LIST_REPOSITORY_ISSUES') {
    schema.description += 'If not specified, use the `composiohq/composio` repository';
  }
  return schema;
};

const tools = await composio.tools.get(
  userId,
  {
    tools: ['GITHUB_LIST_REPOSITORY_ISSUES'],
  },
  {
    modifySchema: addDescription,
  }
);

console.log(tools);

// const { text } = await generateText({
//   model: anthropic('claude-4-sonnet'),
//   messages: [
//     {
//       role: 'user',
//       content: 'What are some issues on my GitHub repo?',
//     },
//   ],
//   tools,
//   maxSteps: 3,
// });

// console.log(text);
