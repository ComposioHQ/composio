/**
 * Triggers Example
 *
 * This example demonstrates how to use Composio SDK for triggers.
 *
 * Prerequisites:
 * 1. Set up your COMPOSIO_API_KEY in the .env file
 * 2. Install dependencies: pnpm install
 * 3. Run the example: pnpm start
 */

import { Composio } from '@composio/core';
import 'dotenv/config';

/**
 * Initialize Composio
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

/**
 * Main function to run the example
 */
async function main() {
  try {
    console.log('🚀 Starting Triggers Example...');

    // Get available tools
    const tools = await composio.tools.get('default', {
      // Specify the apps you want to use
      toolkits: ['gmail', 'googlecalendar'],
      limit: 10,
    });

    console.log(`✅ Found ${tools.length} tools`);

    // TODO: Add your example implementation here
    console.log('📝 Implement your triggers logic here!');
  } catch (error) {
    console.error('❌ Error running example:', error);
  }
}

// Run the example
main().catch(console.error);
