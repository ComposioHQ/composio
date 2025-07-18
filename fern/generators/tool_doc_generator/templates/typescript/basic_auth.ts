import { Composio } from '@composio/core';

// Replace these with your actual values
const {{toolkit_slug}}_auth_config_id = "{{auth_config_id|default:'ac_YOUR_AUTH_CONFIG_ID'}}"; // Auth config ID created above
const userId = "{{user_id|default:'user@example.com'}}"; // User ID from database/application

const composio = new Composio();

async function authenticateToolkit(userId: string, authConfigId: string) {
  // TODO: Replace these with a method to retrieve credentials from the user.
  // In production, these should be securely retrieved from your database or user input.
  // For example: const { username, password } = await getUserCredentials(userId);
  const username = "{{username_placeholder|default:'your_username'}}"; // Replace with actual username
  const password = "{{password_placeholder|default:'your_password'}}"; // Replace with actual password
  
  const connectionRequest = await composio.connectedAccounts.initiate({
    userId: userId,
    authConfigId: authConfigId,
    config: {
      authScheme: "BASIC",
      config: {
        username: username,
        password: password
      }
    }
  });
  
  // Basic authentication is immediate - no redirect needed
  console.log(`Successfully connected {{toolkit_name}} for user ${userId}`);
  console.log(`Connection status: ${connectionRequest.status}`);
  
  return connectionRequest.id;
}

// Authenticate the toolkit
const connectionId = await authenticateToolkit(userId, {{toolkit_slug}}_auth_config_id);

// You can verify the connection using:
const connectedAccount = await composio.connectedAccounts.get(connectionId);
console.log("Connected account:", connectedAccount);