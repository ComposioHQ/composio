import { Composio, ConsoleTelemetryTransport } from '@composio/core';

/**
 * Non agentic provider
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER');

console.log(tools);
