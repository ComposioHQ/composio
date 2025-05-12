import { Composio, ToolListParamsSchema } from '@composio/core';
import { OpenAI } from 'openai';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const tool = await composio.getToolBySlug('HACKERNEWS_GET_USER');

console.log(tool);
