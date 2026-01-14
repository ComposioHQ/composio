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

// const authConfigs = await composio.authConfigs.list();
// console.log(authConfigs);
const client = composio.getClient()
const authConfigs = await client.authConfigs.list()
console.log(authConfigs)