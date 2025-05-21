# Connected Accounts API

The `ConnectedAccounts` class provides methods to manage user connections to external services (toolkits). Connected accounts store authentication tokens and other information needed to access these services.

## Methods

### list(query?)

Lists all connected accounts based on provided filter criteria.

```typescript
// List all connected accounts
const allAccounts = await composio.connectedAccounts.list();

// List accounts for a specific user
const userAccounts = await composio.connectedAccounts.list({
  userIds: ['user123'],
});

// List accounts for a specific toolkit
const githubAccounts = await composio.connectedAccounts.list({
  toolkitSlugs: ['github'],
});
```

**Parameters:**

- `query` (ConnectedAccountListParams): Optional query parameters for filtering connected accounts

**Returns:** Promise<ConnectedAccountListResponse> - A paginated list of connected accounts

**Throws:** ValidationError if the query fails validation against the expected schema

### initiate(userId, authConfigId, options?)

Creates a new connected account and returns a connection request. Users can then wait for the connection to be established using the `waitForConnection` method.

```typescript
const connectionRequest = await composio.connectedAccounts.initiate('user_123', 'auth_config_123', {
  data: {
    name: 'My GitHub Account',
  },
  callbackUrl: 'https://myapp.com/auth/callback',
});

// The redirectUrl is where the user should be redirected to authenticate
console.log(connectionRequest.redirectUrl);

// wait for the user to connected the acocunt
const connectedAccount = await connectionRequest.waitForConnection();
```

**Parameters:**

- `userId` (string): User ID of the connected account
- `authConfigId` (string): Auth config ID of the connected account
- `options` (CreateConnectedAccountOptions): Data for creating a new connected account

**Returns:** Promise<ConnectionRequest> - Connection request object

### waitForConnection(connectedAccountId, timeout?)

Waits for a connection request to complete and become active.

```typescript
// Wait for a connection to complete with default timeout
const connectedAccount = await composio.connectedAccounts.waitForConnection('conn_123abc');

// Wait with a custom timeout of 2 minutes
const connectedAccount = await composio.connectedAccounts.waitForConnection('conn_123abc', 120000);
```

**Parameters:**

- `connectedAccountId` (string): The ID of the connected account to wait for
- `timeout` (number): Maximum time to wait in milliseconds (default: 60 seconds)

**Returns:** Promise<ConnectedAccountRetrieveResponse> - The finalized connected account data

**Throws:**

- `ComposioConnectedAccountNotFoundError`: If the connected account cannot be found
- `ConnectionRequestFailedError`: If the connection enters a failed, expired, or deleted state
- `ConnectionRequestTimeoutError`: If the connection does not complete within the timeout period

### get(nanoid)

Retrieves a specific connected account by its ID.

```typescript
// Get a connected account by ID
const account = await composio.connectedAccounts.get('conn_abc123');
console.log(account.status); // e.g., 'ACTIVE'
console.log(account.toolkit.slug); // e.g., 'github'
```

**Parameters:**

- `nanoid` (string): The unique identifier of the connected account

**Returns:** Promise<ConnectedAccountRetrieveResponse> - The connected account details

**Throws:** Error if the connected account cannot be found or an API error occurs

### delete(nanoid)

Deletes a connected account.

```typescript
// Delete a connected account
await composio.connectedAccounts.delete('conn_abc123');
```

**Parameters:**

- `nanoid` (string): The unique identifier of the connected account to delete

**Returns:** Promise<ConnectedAccountDeleteResponse> - The deletion response

**Throws:** Error if the account doesn't exist or cannot be deleted

### refresh(nanoid)

Refreshes a connected account's authentication credentials.

```typescript
// Refresh a connected account's credentials
const refreshedAccount = await composio.connectedAccounts.refresh('conn_abc123');
```

**Parameters:**

- `nanoid` (string): The unique identifier of the connected account to refresh

**Returns:** Promise<ConnectedAccountRefreshResponse> - The response containing the refreshed account details

**Throws:** Error if the account doesn't exist or credentials cannot be refreshed

### updateStatus(nanoid, params)

Updates the status of a connected account.

```typescript
// Update the status of a connected account
const updatedAccount = await composio.connectedAccounts.updateStatus('conn_abc123', {
  enabled: true,
});
```

**Parameters:**

- `nanoid` (string): The unique identifier of the connected account
- `params` (ConnectedAccountUpdateStatusParams): The parameters for updating the status

**Returns:** Promise<ConnectedAccountUpdateStatusResponse> - The updated account details

### enable(nanoid)

Enables a connected account.

```typescript
// Enable a connected account
const enabledAccount = await composio.connectedAccounts.enable('conn_abc123');
```

**Parameters:**

- `nanoid` (string): The unique identifier of the connected account

**Returns:** Promise<ConnectedAccountUpdateStatusResponse> - The updated account details

### disable(nanoid)

Disables a connected account.

```typescript
// Disable a connected account
const disabledAccount = await composio.connectedAccounts.disable('conn_abc123');
```

**Parameters:**

- `nanoid` (string): The unique identifier of the connected account

**Returns:** Promise<ConnectedAccountUpdateStatusResponse> - The updated account details

## Types

### ConnectedAccountListParams

```typescript
interface ConnectedAccountListParams {
  authConfigIds?: string[]; // Filter by auth config IDs
  cursor?: string; // Pagination cursor
  labels?: string[]; // Filter by labels
  limit?: number; // Limit the number of results
  orderBy?: string; // Order by field
  statuses?: string[]; // Filter by statuses
  toolkitSlugs?: string[]; // Filter by toolkit slugs
  userIds?: string[]; // Filter by user IDs
}
```

### ConnectedAccountListResponse

```typescript
interface ConnectedAccountListResponse {
  items: ConnectedAccountRetrieveResponse[]; // List of connected accounts
  nextCursor: string | null; // Pagination cursor
  totalPages: number; // Total number of pages
}
```

### ConnectedAccountRetrieveResponse

```typescript
interface ConnectedAccountRetrieveResponse {
  id: string; // Connected account ID
  status: string; // Status (e.g., 'ACTIVE', 'PENDING')
  statusReason: string | null; // Reason for the status
  userId: string; // User ID
  toolkit: {
    // Associated toolkit
    id: string; // Toolkit ID
    slug: string; // Toolkit slug
    name: string; // Toolkit name
  };
  authConfig: {
    // Associated auth config
    id: string; // Auth config ID
    authScheme: string; // Auth scheme (e.g., 'oauth2')
    isComposioManaged: boolean; // Whether it's managed by Composio
    isDisabled: boolean; // Whether it's disabled
  };
  isDisabled: boolean; // Whether the connected account is disabled
  meta: Record<string, unknown>; // Additional metadata
  createdAt: string; // Creation timestamp
  updatedAt: string; // Last update timestamp
  testRequestEndpoint: string | null; // Endpoint for testing the connection
}
```

### CreateConnectedAccountOptions

```typescript
interface CreateConnectedAccountOptions {
  data?: Record<string, unknown>; // Additional data for the connection
  callbackUrl?: string; // URL to redirect after authentication
}
```

### ConnectedAccountUpdateStatusParams

```typescript
interface ConnectedAccountUpdateStatusParams {
  enabled: boolean; // Whether the account should be enabled
}
```
