/**
 * Tools Example
 *
 * This example demonstrates how to use Composio SDK for tools.
 *
 * Prerequisites:
 * 1. Set up your COMPOSIO_API_KEY in the .env file
 * 3. Run the example: pnpm start
 */

import { Composio } from '@composio/core';
import 'dotenv/config';
import path from 'path';

/**
 * Initialize Composio
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  allowTracking: false,
  allowTracing: false,
});

/**
 * Main function to run the example
 */
async function main() {
  try {
    console.log('🚀 Starting Tools Example...');

    const tools = await composio.tools.getRawComposioTools({
      tools: ['GOOGLEDRIVE_UPLOAD_FILE'],
    });

    console.log(JSON.stringify(tools, null, 2));

    const result = await composio.tools.execute('GOOGLEDRIVE_UPLOAD_FILE', {
      arguments: {
        file_to_upload: path.join(__dirname, 'image.png'),
      },
      userId: 'default',
    });

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Error running example:', error);
  }
}

// Run the example
main().catch(console.error);
