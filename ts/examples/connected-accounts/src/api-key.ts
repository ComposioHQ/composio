import { AuthScheme, Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

const connectionRequest = await composio.connectedAccounts.initiate('user_123', 'auth_config_123', {
  config: AuthScheme.APIKey({
    api_key: 'your_api_key',
  }),
});

console.log(connectionRequest);
