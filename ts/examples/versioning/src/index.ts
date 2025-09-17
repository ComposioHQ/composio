/**
 * Versioning Example
 *
 * This example demonstrates how to use Composio SDK for versioning.
 *
 * Prerequisites:
 * 1. Set up your COMPOSIO_API_KEY in the .env file
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

const config = composio.getConfig()
console.log(JSON.stringify(config, null, 2))

/**
 * Main function to run the example
 */
async function main() {
  try {
    console.log('🚀 Starting Versioning Example...');
    
    // Get available tools
    const tools = await composio.tools.get('default', {
      // Specify the apps you want to use
      toolkits: ['gmail', 'googlecalendar'],
      limit: 10,
    });
    
    console.log(`✅ Found ${tools.length} tools`);
    
    // TODO: Add your example implementation here
    console.log('📝 Implement your versioning logic here!');
    
  } catch (error) {
    console.error('❌ Error running example:', error);
  }
}

// Run the example
main().catch(console.error);
