/**
 * Mastra Example
 *
 * This example demonstrates how to use Composio SDK for mastra.
 *
 * Prerequisites:
 * 1. Set up your COMPOSIO_API_KEY in the .env file
 * 2. Set up your OPENAI_API_KEY in the .env file
 * 3. Run the example: pnpm start
 */
import { MastraProvider } from '@composio/mastra';
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { Composio } from '@composio/core';
import 'dotenv/config';

/**
 * Initialize Composio
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new MastraProvider(),
});

/**
 * Get the tools from Composio
 * Attach beforeExecute and afterExecute hooks to the tools for logging
 */
const tools = await composio.tools.get('default', 'HACKERNEWS_GET_USER', {
  modifySchema: (toolSlug, toolkitSlug, schema) => {
    console.log(
      `🔄 Modifying schema for tool ${toolSlug}/${toolkitSlug} with schema ${JSON.stringify(schema)}`
    );
    return schema;
  },
  beforeExecute: (toolSlug, toolkitSlug, input) => {
    console.log(`🔄 Executing tool ${toolSlug}/${toolkitSlug} with input ${JSON.stringify(input)}`);
    return input;
  },
  afterExecute: (toolSlug, toolkitSlug, output) => {
    console.log(
      `✅ Tool ${toolSlug}/${toolkitSlug} executed successfully with output ${JSON.stringify(output)}`
    );
    return output;
  },
});

/**
 * Create the mastra agent
 */
const hackernewsAgent = new Agent({
  name: 'Weather Agent',
  instructions:
    'You are a helpful assistant that can use the Hackernews API to get user information.',
  model: openai('gpt-4o-mini'),
  tools: tools,
});

/**
 * Generate a response from the agent
 */
const { text } = await hackernewsAgent.generate([
  { role: 'user', content: 'Tell me about the user `pg` on hackernews' },
]);

console.log('\n🤖 Agent Response:\n');
console.log(text);
