import { Composio } from '@composio/core';

const composio = new Composio();

const authConfigId = process.env.COMPOSIO_EXAMPLES_GMAIL_AUTH_CONFIG_ID; // your auth config ID
if (!authConfigId) {
  throw new Error('Set COMPOSIO_EXAMPLES_GMAIL_AUTH_CONFIG_ID');
}

const response = await composio.authConfigs.get(authConfigId);

console.log(JSON.stringify(response, null, 2));
