import { Composio } from '@composio/core';

const composio = new Composio({ apiKey: 'your_api_key' });

// Get a specific connected account by its nanoid
const connectedAccount = await composio.connectedAccounts.get('your_connected_account_id');
console.log(`Status: ${connectedAccount.status}`);

// Filter connections by user_id, auth_config_id, and status (only active accounts)
const filteredConnections = await composio.connectedAccounts.list({
  userIds: ['user_123'],
  authConfigIds: ['your_auth_config_id'],
  statuses: ['ACTIVE']
});
filteredConnections.items.forEach(connection => {
  console.log(`${connection.id}: ${connection.status}`);
});
