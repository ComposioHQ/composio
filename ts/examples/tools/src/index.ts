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
});

/**
 * Main function to run the example
 */
async function main() {
  try {
    console.log('🚀 Starting Upload file Example...');

    console.log('🔄 Uploading file...');
    const result = await composio.tools.execute('GOOGLEDRIVE_UPLOAD_FILE', {
      dangerouslySkipVersionCheck: true,
      arguments: {
        file_to_upload: path.join(__dirname, 'image.png'),
      },
      userId: 'default',
    });
    console.log('✅ File uploaded successfully...');
    console.log(JSON.stringify(result, null, 2));

    console.log('🔄 Downloading file...');
    const result2 = await composio.tools.execute('GOOGLEDRIVE_DOWNLOAD_FILE', {
      dangerouslySkipVersionCheck: true,
      arguments: {
        file_id: (result.data.response_data as unknown as { id: string }).id,
      },
      userId: 'default',
    });
    console.log('✅ File downloaded successfully...');
    console.log(JSON.stringify(result2, null, 2));
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
