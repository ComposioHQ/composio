import { AuthConfigTypes, AuthSchemeTypes, Composio } from '@composio/core';

// Initialize Composio
// OpenAI Toolset is automatically installed and initialized
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

/**
 * Create a new auth config
 */
const authConfig = await composio.createAuthConfig('my-toolkit', {
  type: AuthConfigTypes.CUSTOM,
  authScheme: AuthSchemeTypes.BASIC,
  credentials: {
    // this should error not like the credentials should come from the auth scheme type
    apiKey: '1234567890',
  },
});

/**
 * Create a new connected account
 */
const ConnectionRequest = await composio.initiateConnection('default', authConfig.id);
const connectedAccount = await ConnectionRequest.waitForConnection();

console.log(connectedAccount);
