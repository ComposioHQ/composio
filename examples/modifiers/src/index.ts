import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';

/**
 * Non agentic provider
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER', {
  // toolkit slug too
  modifySchema: (toolSlug, toolkitSlug, toolSchema) => {
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

/**
 * Agentic provider
 */
const vercel = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  // calling this provider now no? or what? or toolProvider or toolManager?
  provider: new VercelProvider(),
});

const agenticTools = await vercel.tools.get(
  'default',
  // what is the type error i am getting here?
  { tools: ['HACKERNEWS_GET_USER'] },
  {
    afterExecute: (toolSlug, toolkitSlug, result) => {
      // modify the result
      return result;
    },
    beforeExecute: (toolSlug, toolkitSlug, params) => {
      // modify the params
      return params;
    },
    modifySchema: (toolSlug, toolkitSlug, toolSchema) => {
      // modify the tool schema
      return toolSchema;
    },
  }
);

console.log(agenticTools);
