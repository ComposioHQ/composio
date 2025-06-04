/**
 * Custom-tools Example
 *
 * This example demonstrates how to use Composio SDK for custom-tools.
 *
 * Prerequisites:
 * 1. Set up your COMPOSIO_API_KEY in the .env file
 * 3. Run the example: pnpm start
 */

import { Composio } from '@composio/core';
import 'dotenv/config';
import { z } from 'zod';

/**
 * Initialize Composio
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

/**
 * Create a custom hackernews tool
 * This tool will be registerd in the composio instance and store in memory temporarily.
 */
const customToolSlug = 'GITHUB_STAR_COMPOSIOHQ_REPOSITORY';
const tool = await composio.tools.createCustomTool({
  slug: customToolSlug,
  name: 'Github star composio repositories',
  toolkitSlug: 'github',
  description: 'For any given repository of the user composiohq, star the repository',
  inputParams: z.object({
    repository: z.string().describe('The repository to star'),
  }),
  execute: async (input, authCredentials, executeToolRequest) => {
    console.log('🚀 ~ execute: ~ params:', input);
    console.log('🚀 ~ execute: ~ authCredentials:', authCredentials);

    const result = await executeToolRequest({
      endpoint: `/user/starred/composiohq/${input.repository}`,
      method: 'PUT',
    });
    return result;
  },
});

console.log('🚀 created tool:', tool);

/**
 * Main function to run the example
 */
async function main() {
  try {
    console.log('🚀 Starting Custom-tools Example...');

    // Get available tools
    const tools = await composio.tools.get('default', customToolSlug);

    console.log('tools:', tools);

    const result = await composio.tools.execute(customToolSlug, {
      arguments: {
        repository: 'composio',
      },
      userId: 'default',
    });

    console.log('🚀 Result:', result);
  } catch (error) {
    console.error('❌ Error running example:', error);
  }
}

// Run the example
main().catch(console.error);
