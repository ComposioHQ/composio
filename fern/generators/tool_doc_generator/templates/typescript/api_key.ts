import { Composio } from '@composio/core';
import { AuthScheme } from '@composio/core';
// Replace these with your actual values
const {{toolkit_slug}}_auth_config_id = "ac_YOUR_{{toolkit_slug|upper}}_CONFIG_ID"; // Auth config ID created above
const userId = "{{user_id|default:'user@example.com'}}"; // User ID from database/application

const composio = new Composio();

async function authenticateToolkit(userId: string, authConfigId: string) {
  // TODO: Replace this with a method to retrieve the API key from the user.
  // In production, this should be securely retrieved from your database or user input.
  // For example: const userApiKey = await getUserApiKey(userId);
  const userApiKey = "your_{{toolkit_slug}}_api_key"; // Replace with actual API key
  
  const connectionRequest = await composio.connectedAccounts.initiate(
    userId,
    authConfigId,
    {
      config: AuthScheme.APIKey({
        api_key: userApiKey
      })
    }
  );
  
  // API Key authentication is immediate - no redirect needed
  console.log(`Successfully connected {{toolkit_name}} for user ${userId}`);
  console.log(`Connection status: ${connectionRequest.status}`);
  
  return connectionRequest.id;
}

// Authenticate the toolkit
const connectionId = await authenticateToolkit(userId, {{toolkit_slug}}_auth_config_id);

// You can verify the connection using:
const connectedAccount = await composio.connectedAccounts.get(connectionId);
console.log("Connected account:", connectedAccount);