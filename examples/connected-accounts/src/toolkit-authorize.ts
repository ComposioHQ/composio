import { Composio } from '@composio/core';

// Initialize Composio
// OpenAI Toolset is automatically installed and initialized
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

/**
 * This is a coumpound flow which will initiate a connection request and wait for the user to authorize the toolkit
 */
const connectionRequest = await composio.toolkits.authorize('default', 'github');
const redirectUrl = connectionRequest.redirectUrl;
/**
 * If the redirectUrl is not null, it means that the user needs to visit the following URL to authorize the toolkit
 */
if (redirectUrl) {
  console.log(`⚠️ Please visit the following URL to authorize the toolkit: ${redirectUrl}`);
}
console.log('🔄 Waiting for connection...');
/**
 * This will wait for the user to authorize the toolkit and then return the connected account
 * Optionally, you can pass a timeout to the waitForConnection method
 */
const connectedAccount = await connectionRequest.waitForConnection();
console.log(`✅ Connected account created: ${connectedAccount.id}`);
console.log(connectedAccount);
