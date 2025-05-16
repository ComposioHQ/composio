import { Composio } from '@composio/core';

// Initialize Composio
// OpenAI Toolset is automatically installed and initialized
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

// magic flow
const connectionRequest = await composio.toolkits.authorize('default', 'github');
const redirectUrl = connectionRequest.redirectUrl;
// app requires user to visit the following URL to authorize the toolkit
if (redirectUrl) {
  console.log(`⚠️ Please visit the following URL to authorize the toolkit: ${redirectUrl}`);
}
console.log('Waiting for connection...');
const connectedAccount = await connectionRequest.waitForConnection();
console.log(`✅ Connected account created: ${connectedAccount.id}`);
console.log(connectedAccount);
