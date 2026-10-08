import { AuthScheme, Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const authConfigId = process.env.COMPOSIO_EXAMPLES_APIKEY_AUTH_CONFIG_ID; // an API-key-scheme auth config ID
const apiKey = process.env.COMPOSIO_EXAMPLES_APIKEY_PLACEHOLDER; // the service API key to store
const userId = process.env.COMPOSIO_EXAMPLES_USER_ID; // the user id from your database
if (!authConfigId || !apiKey || !userId) {
  throw new Error(
    'Set COMPOSIO_EXAMPLES_APIKEY_AUTH_CONFIG_ID, COMPOSIO_EXAMPLES_APIKEY_PLACEHOLDER and COMPOSIO_EXAMPLES_USER_ID'
  );
}

const connectionRequest = await composio.connectedAccounts.initiate(userId, authConfigId, {
  // Allow more than one connected account per user for this auth config
  allowMultiple: true,
  config: AuthScheme.APIKey({
    generic_api_key: apiKey,
  }),
});

console.log(connectionRequest);
