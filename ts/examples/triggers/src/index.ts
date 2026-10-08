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
  // baseURL: 'https://staging-backend.composio.dev',
});

/**
 * Main function to run the example
 */
async function main() {
  try {
    console.log('🚀 Starting Triggers Example...');

    // Get available tools
    const tools = await composio.tools.get('default', {
      // Specify the toolkits you want to use
      toolkits: ['gmail', 'googlecalendar'],
      limit: 10,
    });

    console.log(`✅ Found ${tools.length} tools`);

    // TODO: Add your example implementation here
    console.log(
      '📝 Go to https://app.composio.dev to create an app and add a trigger, Once you have an incoming trigger, you will see the events'
    );

    await composio.triggers.subscribe(data => {
      console.log('🔔 Trigger received:', JSON.stringify(data, null, 2));
    });
    console.log('Subscribed to trigger events');
  } catch (error) {
    console.error('❌ Error running example:', error);
    process.exitCode = 1;
  }
}

// Run the example
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
