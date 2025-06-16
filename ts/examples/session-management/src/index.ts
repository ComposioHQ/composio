/**
 * Session-management Example
 *
 * This example demonstrates how to use Composio SDK for session-management.
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

/**
 * Main function to run the example
 */
async function main() {
  try {
    console.log('🚀 Starting Session-management Example...');

    // create a session with custom request options
    const session = composio.createSession({
      headers: {
        'x-request-id': 'custom-value',
      },
    });

    // use the session to make API calls
    const tools = await session.tools.get('default', 'HACKERNEWS_GET_USER');
    console.log(`✅ Found ${tools.length} tools`);
  } catch (error) {
    console.error('❌ Error running example:', error);
  }
}

// Run the example
main().catch(console.error);
