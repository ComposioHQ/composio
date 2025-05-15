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

vercel.tools.get(
  'user-id',
  // what is the type error i am getting here?
  { toolkits: [''] },
  {
    // here for toolkitSlug and toolSlug before the generation mapping thing comes we should have basic generic that gets from the input type itself
    // so if i have toolkits then i get toolkit name and if i have tools then i get tool name
    modifyToolSchema: (toolSlug, toolSchema) => {
      return toolSchema;
    },
    afterToolExecute: (toolSlug, result) => {
      // hmm i wonder about this
    },
    beforeToolExecute: (toolSlug, params) => {
      // here we should give a subset of params like userId should not be mutable here
    },
  }
);
