import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const authConfigId = process.env.COMPOSIO_EXAMPLES_GMAIL_AUTH_CONFIG_ID; // your auth config ID
if (!authConfigId) {
  throw new Error('Set COMPOSIO_EXAMPLES_GMAIL_AUTH_CONFIG_ID');
}

const connectionRequest = await composio.connectedAccounts.initiate('default', authConfigId, {
  allowMultiple: true,
});

console.log(connectionRequest.redirectUrl);
