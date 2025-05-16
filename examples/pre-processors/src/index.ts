import { Composio } from '@composio/core';
import { VercelToolset } from '@composio/vercel';

/**
 * Non agentic toolset
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const toolkit = await composio.toolkits.get('HACKERNEWS');

console.log(toolkit);

const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER', {
  // toolkit slug too
  modifyToolSchema: (toolSlug, toolSchema) => {
    if (toolSlug === 'HACKERNEWS_GET_USER') {
      toolSchema = {
        ...toolSchema,
        inputParameters: {
          ...toolSchema.inputParameters,
          userId: {
            type: 'string',
            description: 'The user ID to get the user for',
          },
        },
      };
    }

    return toolSchema;
  },
});

console.log(tools);

const vercel = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  // calling this provider now no? or what? or toolProvider or toolManager?
  toolset: new VercelToolset(),
});

const agenticTools = await vercel.tools.get(
  'default',
  // what is the type error i am getting here?
  { tools: ['HACKERNEWS_GET_USER'] },
  {
    afterToolExecute: (toolSlug, result) => {
      // modify the result
      return result;
    },
    beforeToolExecute: (toolSlug, params) => {
      // modify the params
      return params;
    },
    modifyToolSchema: (toolSlug, toolSchema) => {
      // modify the tool schema
      return toolSchema;
    },
  }
);

console.log(agenticTools);
