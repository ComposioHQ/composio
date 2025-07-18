import { Composio } from '@composio/core';

// Replace these with your actual values
const {{toolkit_slug}}_auth_config_id = "{{auth_config_id|default:'ac_YOUR_AUTH_CONFIG_ID'}}"; // Auth config ID created above
const userId = "{{user_id|default:'user@example.com'}}"; // User ID from database/application

const composio = new Composio();

async function authenticateToolkit(userId: string, authConfigId: string) {
  const connectionRequest = await composio.connectedAccounts.initiate({
    userId: userId,
    authConfigId: authConfigId,
  });

  console.log(`Visit this URL to authenticate {{toolkit_name}}: ${connectionRequest.redirectUrl}`);
  
  // This will wait for the auth flow to be completed
  await connectionRequest.waitForConnection(60);
  
  return connectionRequest.id;
}

// Authenticate the toolkit
const connectionId = await authenticateToolkit(userId, {{toolkit_slug}}_auth_config_id);

// You can also verify the connection status using:
const connectedAccount = await composio.connectedAccounts.get(connectionId);
console.log("Connected account:", connectedAccount);