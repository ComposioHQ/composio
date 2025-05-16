/**
 * Basic Composio Tool Fetching Example
 * 
 * This example demonstrates how to fetch a tool from Composio.
 * It retrieves the HACKERNEWS_GET_USER tool and logs its schema.
 */
import { Composio } from '@composio/core';
import dotenv from 'dotenv';

dotenv.config();

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

/**
 * Main function to demonstrate fetching a tool from Composio
 */
async function main() {
  try {
    console.log('Fetching HACKERNEWS_GET_USER tool...');
    const tool = await composio.getToolBySlug('default', 'HACKERNEWS_GET_USER');
    
    console.log('Tool details:');
    console.log(JSON.stringify(tool, null, 2));
    
    console.log('\nInput parameters:');
    if (tool.function.parameters.properties) {
      for (const [key, value] of Object.entries(tool.function.parameters.properties)) {
        console.log(`- ${key}: ${JSON.stringify(value)}`);
      }
    }
  } catch (error) {
    console.error('Error fetching tool:', error);
  }
}

main();
