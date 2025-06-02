/**
 * Custom-tools Example
 *
 * This example demonstrates how to use Composio SDK for simple custom-tools.
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
 * Create a custom calculate square of a number tool
 * This tool will be registerd in the composio instance and store in memory temporarily.
 */
const customToolSlug = 'CALCULATE_SQUARE_OF_A_NUMBER';
const tool = await composio.tools.createCustomTool({
  slug: customToolSlug,
  name: 'Calculate square of a number',
  description: 'For any given number the tool calculates the square of the number',
  inputParams: z.object({
    number: z.number().describe('The number to calculate the square of'),
  }),
  execute: async input => {
    const { number } = input;
    const result = Number(number) * Number(number);

    return {
      data: {
        result,
      },
      error: null,
      successful: true,
    };
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
        number: 2,
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
