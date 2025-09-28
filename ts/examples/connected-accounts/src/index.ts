import { AuthConfigTypes, Composio } from '@composio/core';

// Initialize Composio
// OpenAI Provider is automatically installed and initialized
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

/**
 * Create a new auth config
 */
const authConfig = await composio.authConfigs.create('github', {
  type: AuthConfigTypes.COMPOSIO_MANAGED,
  name: 'My GitHub Auth Config',
});

console.log(`✅ Auth config created: ${authConfig.id}`);
console.log(`🔄 Createting a connection request`);

/**
 * Create a new connected account
 */
const ConnectionRequest = await composio.connectedAccounts.link('default', authConfig.id);

console.log(ConnectionRequest);

console.log(
  `🔗 Please visit the following URL to authorize the user: ${ConnectionRequest.redirectUrl}`
);
const connectedAccount = await ConnectionRequest.waitForConnection();

console.log(`✅ Connected account created: ${connectedAccount.id}`);
console.log(connectedAccount);
console.log(`🔄 Getting the GitHub tools`);

const tools = await composio.tools.get('default', {
  toolkits: ['github'],
});

console.log(tools);

const authConfigDetails = await composio.authConfigs.get(authConfig.id);

console.log({ authConfigDetails });