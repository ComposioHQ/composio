import { Composio } from '@composio/core';

const composio = new Composio({ apiKey: 'YOUR_COMPOSIO_API_KEY' });

// Define variables
const userId = 'user-123';
const authConfigId = 'auth-config-id';
const connectedAccountId = 'conn_abc123';

// --- Listing Connected Accounts ---

// List all accounts for a user
const accounts = await composio.connectedAccounts.list({
  userIds: [userId]
});

// Filter by status
const activeAccounts = await composio.connectedAccounts.list({
  userIds: [userId],
  statuses: ['ACTIVE']
});

// --- Retrieving a Specific Account ---

const account = await composio.connectedAccounts.get(connectedAccountId);

console.log('Status:', account.status);
console.log('Toolkit:', account.toolkit.slug);

// --- Using Account Credentials ---

// Get the connected account's authentication state
if (account.state) {
  // The state contains the auth scheme and credentials
  const authScheme = account.state.authScheme;
  const credentials = account.state.val;
  
  console.log('Auth scheme:', authScheme);
  console.log('Credentials:', credentials);
}

// --- Refreshing Credentials ---

try {
  const refreshed = await composio.connectedAccounts.refresh(connectedAccountId);
  console.log('Redirect URL:', refreshed.redirect_url);
  
  // Wait for the connection to be established
  await composio.connectedAccounts.waitForConnection(refreshed.id);
} catch (error) {
  console.error('Failed to refresh tokens:', error);
}

// --- Enabling and Disabling Accounts ---

// Disable an account
const disabled = await composio.connectedAccounts.disable(connectedAccountId);
console.log('Account disabled status:', disabled.success);

// Re-enable when needed
const enabled = await composio.connectedAccounts.enable(connectedAccountId);
console.log('Account enabled status:', enabled.success);

// --- Deleting Accounts ---

// Delete a connected account
await composio.connectedAccounts.delete(connectedAccountId);
console.log('Account deleted successfully');

// --- Managing Multiple Accounts ---

// First account
try {
  const firstAccount = await composio.connectedAccounts.initiate(
    userId,
    authConfigId
  );
  console.log('First account redirect URL:', firstAccount.redirectUrl);
  const connectedFirstAccount = await firstAccount.waitForConnection();
  console.log('First account status:', connectedFirstAccount.status);
} catch (error) {
  console.error('Error initiating first account:', error);
}

// Second account - must explicitly allow multiple
try {
  const secondAccount = await composio.connectedAccounts.initiate(
    userId,
    authConfigId,
    {
      allowMultiple: true  // Required for additional accounts
    }
  );
  console.log('Second account redirect URL:', secondAccount.redirectUrl);
  const connectedSecondAccount = await secondAccount.waitForConnection();
  console.log('Second account status:', connectedSecondAccount.status);
} catch (error) {
  console.error('Error initiating second account:', error);
}

// Execute tool with a specific connected account
const result = await composio.tools.execute('GMAIL_GET_PROFILE', {
  userId: userId,
  connectedAccountId: connectedAccountId,  // Specify which account to use
  version: '20251111_00',
  arguments: {}
});
console.log('Tool executed:', result);