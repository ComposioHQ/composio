import { Composio } from '@composio/core';
import { Agent, webSearchTool, fileSearchTool } from '@openai/agents';

const composio = new Composio();

const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER');

const agent = new Agent({
  name: 'Travel assistant',
  tools: tools,
});
