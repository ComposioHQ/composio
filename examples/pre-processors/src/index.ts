import { Composio } from '@composio/core';
import { VercelToolset } from '@composio/vercel';

/**
 * Non agentic toolset
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const toolkit = await composio.toolkits.getToolkitBySlug('HACKERNEWS');

console.log(toolkit);

const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER', {
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
