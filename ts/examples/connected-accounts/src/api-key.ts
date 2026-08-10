import { AuthScheme, Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const authConfigId = process.env.COMPOSIO_EXAMPLES_APIKEY_AUTH_CONFIG_ID; // an API-key-scheme auth config ID
const apiKey = process.env.COMPOSIO_EXAMPLES_APIKEY_SECRET; // the service API key to store
if (!authConfigId || !apiKey) {
  throw new Error('Set COMPOSIO_EXAMPLES_APIKEY_AUTH_CONFIG_ID and COMPOSIO_EXAMPLES_APIKEY_SECRET');
}

const connectionRequest = await composio.connectedAccounts.initiate('default', authConfigId, {
  config: AuthScheme.APIKey({
    generic_api_key: apiKey,
  }),
});

console.log(connectionRequest);
