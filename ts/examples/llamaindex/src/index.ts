/**
 * Llamaindex Example
 *
 * This example demonstrates how to use Composio SDK for llamaindex.
 *
 * Prerequisites:
 * 1. Set up your COMPOSIO_API_KEY in the .env file
 * 3. Run the example: pnpm start
 */

import { Composio } from '@composio/core';
import { LlamaindexProvider } from '@composio/llamaindex';
import { openai } from '@llamaindex/openai';
import { agent, agentStreamEvent } from '@llamaindex/workflow';
import 'dotenv/config';

/**
 * Initialize Composio
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new LlamaindexProvider(),
});

/**
 * Main function to run the example
 */
async function main() {
  try {
    console.log('🚀 Starting Llamaindex Example...');

    // Get available tools
    const tools = await composio.tools.get(
      'default',
      {
        // Specify the apps you want to use
        toolkits: ['hackernews'],
        limit: 10,
      },
      {
        beforeExecute: ({ toolSlug, toolkitSlug, params }) => {
          console.log(`🔄 Executing tool ${toolSlug}/${toolkitSlug} with params:`, { params });
          return params;
        },
        afterExecute: ({ toolSlug, toolkitSlug, result }) => {
          console.log(`✅ Executed tool ${toolSlug}/${toolkitSlug} with result:`, { result });
          return result;
        },
      }
    );

    console.log(`✅ Found ${tools.length} tools`);

    // TODO: Add your example implementation here
    console.log('📝 Fetching posts from hackernews!');
    const hackernewsAgent = agent({
      name: 'Hackernews Agent',
      description: 'A helpful hackernews assistant',
      llm: openai({ model: 'gpt-4o-mini' }),
      systemPrompt:
        'You are a helpful hackernews assistant that helps users with their queries related to hackernews',
      tools,
    });

    const stream = await hackernewsAgent.runStream('Summarize the front page of hackernews');

    for await (const event of stream) {
      if (agentStreamEvent.include(event)) {
        process.stdout.write(event.data.delta);
      }
    }
  } catch (error) {
    console.error('❌ Error running example:', error);
  }
}

// Run the example
main().catch(console.error);
