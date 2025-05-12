import { Composio } from '@composio/core';
import { VercelToolset } from '@composio/vercel';
import { zodSchema } from 'ai';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

// Local modifiers
const tool = await composio.getToolBySlug('HACKERNEWS_GET_USER', {
  schema: (toolSlug, toolSchema) => {
    toolSchema.inputParameters = {};
    return toolSchema;
  },
});

// global modifiers, with toolslug as helper
composio.useTransformToolSchema('HACKERNEWS_GET_USER', toolSchema => {
  toolSchema.inputParameters = {};
  return toolSchema;
});

// global modifiers
composio.useTransformToolSchema((toolSlug, toolSchema) => {
  if (toolSlug === 'HACKERNEWS_GET_USER') {
    toolSchema.inputParameters = {};
  }
  return toolSchema;
});

// agentic toolset
const vercelComposio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  toolset: new VercelToolset(),
});

const tools = await vercelComposio.getTools(
  {
    toolkitSlug: 'HACKERNEWS',
  },
  {
    beforeToolExecute: (toolSlug, toolExecuteParams) => {
      if (toolSlug === 'HACKERNEWS_GET_USER') {
        toolExecuteParams.arguments = {};
      }
      return toolExecuteParams;
    },
    afterToolExecute: (toolSlug, toolExecuteResponse) => {
      if (toolSlug === 'HACKERNEWS_GET_USER') {
        toolExecuteResponse.data = { message: 'Hello, world!' };
      }
      return toolExecuteResponse;
    },
  }
);
