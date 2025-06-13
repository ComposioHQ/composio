/**
 * Json-schema-to-zod Example
 *
 * This example demonstrates how to use Composio SDK for json-schema-to-zod.
 *
 * Prerequisites:
 * 1. Set up your COMPOSIO_API_KEY in the .env file
 * 3. Run the example: pnpm start
 */

import { Composio, jsonSchemaToZodSchema } from '@composio/core';
import { zodToJsonSchema } from 'zod-to-json-schema';
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
    console.log('🚀 Starting Json-schema-to-zod Example...');

    // Get available tools
    const tool = await composio.tools.getRawComposioToolBySlug(
      'default',
      'GOOGLECALENDAR_PATCH_EVENT'
    );

    console.log(JSON.stringify(tool.inputParameters, null, 2));

    const zodSchema = jsonSchemaToZodSchema(tool.inputParameters ?? {});

    console.log(JSON.stringify(zodToJsonSchema(zodSchema), null, 2));
    // TODO: Add your example implementation here
    console.log('📝 Implement your json-schema-to-zod logic here!');
  } catch (error) {
    console.error('❌ Error running example:', error);
  }
}

// Run the example
main().catch(console.error);
