/**
 * File-handling Example
 *
 * This example demonstrates how to use Composio SDK for file-handling.
 *
 * Prerequisites:
 * 1. Set up your COMPOSIO_API_KEY in the .env file
 * 3. Run the example: pnpm start
 */

import { Composio } from '@composio/core';
import { file } from 'bun';
import 'dotenv/config';
import path from 'path';

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
    console.log('🚀 Starting File-handling Example...');

    // Get available tools
    const tools = await composio.tools.get('default', 'GMAIL_SEND_EMAIL');

    console.log(`✅ Found ${tools.length} tools`);

    const filePath =
      'https://avatars.githubusercontent.com/u/128464815?v=4&id=sdsdjljkljlsdfjslkfjlksdjflkdjflksdjflksdfwfowdfk;dfkl;sdfk;slkf;lskf;lsdkf;lk';

    console.log(`Sending file from ${filePath}`);

    const result = await composio.tools.execute('GMAIL_SEND_EMAIL', {
      userId: 'default',
      arguments: {
        attachment: filePath,
        recipient_email: 'musthaq@composio.dev',
        user_id: 'me',
        body: 'Hello, this is a test email with a file attachment.',
        subject: 'Test Email with Attachment',
      },
    });

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Error running example:', error);
  }
}

// Run the example
main().catch(console.error);
