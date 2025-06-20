import { Composio } from '@composio/core';

const composio = new Composio();
const linearAuthConfigId = 'ac_dqYN9oElNVlg';

const userId = '1111-2222-3333';

// Initiate the OAuth connection request
const connRequest = await composio.connectedAccounts.initiate(userId, linearAuthConfigId);

// Destructure redirectUrl for easier access
const { redirectUrl, id } = connRequest;
console.log(redirectUrl);

// Wait for the connection to be established
await connRequest.waitForConnection();

// If you only have the connection request ID, you can also wait using:
// Recommended for when connRequest object is destroyed
await composio.connectedAccounts.waitForConnection(id);

// API Key based toolkit

import { AuthScheme } from '@composio/core';
const serpAuthConfigId = 'ac_VWmFEC55Zgv6';

// Retrieved from the user
const userApiKey = 'sk_1234567890';

const serpConnectionRequest = await composio.connectedAccounts.initiate(userId, serpAuthConfigId, {
  config: AuthScheme.APIKey({
    api_key: userApiKey,
  }),
});

console.log(JSON.stringify(serpConnectionRequest, null, 2));

// Auth scheme for Airtable Bearer
import { AuthScheme } from '@composio/core';
const airtableAuthConfigId = 'ac_1234567890';

// Retrieved from the user
const userBearerToken = '1234567890';

const airtableConnectionRequest = await composio.connectedAccounts.initiate(
  userId, airtableAuthConfigId, {
  config: AuthScheme.BearerToken({
    token: userBearerToken,
  }),
});
