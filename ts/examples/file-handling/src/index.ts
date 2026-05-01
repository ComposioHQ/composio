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
import 'dotenv/config';
import path from 'path';

/**
 * Initialize Composio.
 *
 * `dangerouslyAllowAutoUploadDownloadFiles: true` enables the SDK to read local
 * files from disk during tool execution. When that flag is on, local paths are
 * restricted to the directories listed in `fileUploadDirs`. Passing a value
 * REPLACES the default `[~/.composio/temp]` — include it if you want staged
 * uploads to keep working. Pass `false` (or `[]`) to reject every local path
 * while still allowing URLs and `File`/`Blob` objects.
 *
 * `fileDownloadDir` controls where files in tool responses (`s3url` fields) are
 * written. Defaults to `~/.composio/files`.
 */
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  dangerouslyAllowAutoUploadDownloadFiles: true,
  fileUploadDirs: [path.join(__dirname, '..'), '~/.composio/temp'],
  fileDownloadDir: path.join(__dirname, '..', '.composio-downloads'),
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

    const filePath = path.join(__dirname, '..', 'pepe-silvia.png');
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

    console.log(result);
  } catch (error) {
    console.error('❌ Error running example:', error);
  }
}

// Run the example
main().catch(console.error);
