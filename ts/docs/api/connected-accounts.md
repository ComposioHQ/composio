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
// For OAuth based auth configs (no additional parameters needed)
const oauthConnection = await composio.connectedAccounts.initiate('user_123', 'auth_config_123', {
  callbackUrl: 'https://myapp.com/auth/callback',
});

// For API Key based auth configs (requires additional parameters)
const apiKeyConnection = await composio.connectedAccounts.initiate('user_123', 'auth_config_456', {
  config: AuthScheme.ApiKey({
    api_key: 'your_api_key_here',
  }),
});

// For Basic Auth based auth configs (requires username/password)
const basicAuthConnection = await composio.connectedAccounts.initiate(
  'user_123',
  'auth_config_789',
  {
    config: AuthScheme.Basic({
      username: 'your_username',
      password: 'your_password',
    }),
  }
);

// The redirectUrl is where the user should be redirected to authenticate (for OAuth flows)
console.log(oauthConnection.redirectUrl);

// wait for the user to connect the account
const connectedAccount = await oauthConnection.waitForConnection();
```

**Parameters:**

- `userId` (string): User ID of the connected account
- `authConfigId` (string): Auth config ID of the connected account
- `options` (CreateConnectedAccountOptions): Options for creating a new connected account
  - `config`: Connection configuration using AuthScheme helpers
  - `callbackUrl`: URL to redirect after OAuth authentication

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
  config?: ConnectionData; // Connection configuration using AuthScheme helpers
  callbackUrl?: string; // URL to redirect after authentication
}
```

### ConnectedAccountUpdateStatusParams

```typescript
interface ConnectedAccountUpdateStatusParams {
  enabled: boolean; // Whether the account should be enabled
}
```

### Available Authentication Types

The SDK provides helper functions through the `AuthScheme` class for creating properly typed connection configurations. Here's a list of all available authentication schemes and their helper functions:

1. **OAuth2** - No additional parameters needed

   ```typescript
   await composio.connectedAccounts.initiate(userId, authConfigId);
   ```

2. **OAuth1** - No additional parameters needed

   ```typescript
   await composio.connectedAccounts.initiate(userId, authConfigId);
   ```

3. **API Key** - Requires API key parameter

   ```typescript
   await composio.connectedAccounts.initiate(userId, authConfigId, {
     config: AuthScheme.ApiKey({
       api_key: 'your_api_key',
     }),
   });
   ```

4. **Basic Auth** - Requires username and password

   ```typescript
   await composio.connectedAccounts.initiate(userId, authConfigId, {
     config: AuthScheme.Basic({
       username: 'your_username',
       password: 'your_password',
     }),
   });
   ```

5. **Bearer Token** - Requires token

   ```typescript
   await composio.connectedAccounts.initiate(userId, authConfigId, {
     config: AuthScheme.BearerToken({
       token: 'your_bearer_token',
     }),
   });
   ```

6. **Google Service Account** - Requires credentials JSON

   ```typescript
   await composio.connectedAccounts.initiate(userId, authConfigId, {
     config: AuthScheme.GoogleServiceAccount({
       credentials_json: 'your_credentials_json',
     }),
   });
   ```

7. **Basic with JWT** - Requires username, password, and JWT

   ```typescript
   await composio.connectedAccounts.initiate(userId, authConfigId, {
     config: AuthScheme.BasicWithJwt({
       username: 'your_username',
       password: 'your_password',
       jwt: 'your_jwt_token',
     }),
   });
   ```

8. **Bill.com Auth** - Requires session ID and dev key

   ```typescript
   await composio.connectedAccounts.initiate(userId, authConfigId, {
     config: AuthScheme.BillcomAuth({
       sessionId: 'your_session_id',
       devKey: 'your_dev_key',
     }),
   });
   ```

9. **Composio Link** - No additional parameters needed

   ```typescript
   await composio.connectedAccounts.initiate(userId, authConfigId, {
     config: AuthScheme.ComposioLink(),
   });
   ```

10. **Cal.com Auth** - No additional parameters needed

    ```typescript
    await composio.connectedAccounts.initiate(userId, authConfigId, {
      config: AuthScheme.CalcomAuth(),
    });
    ```

11. **Snowflake** - No additional parameters needed

    ```typescript
    await composio.connectedAccounts.initiate(userId, authConfigId, {
      config: AuthScheme.Snowflake(),
    });
    ```

12. **No Auth** - No additional parameters needed
    ```typescript
    await composio.connectedAccounts.initiate(userId, authConfigId, {
      config: AuthScheme.NoAuth(),
    });
    ```

Each helper function returns a properly typed `ConnectionData` object that ensures type safety and validation through Zod schemas. The connection status will be set to:

- `INITIALIZING` for OAuth2, OAuth1, and ComposioLink schemes
- `ACTIVE` for all other schemes

## Multiple Connected Accounts

By default, Composio prevents users from having multiple connected accounts for the same auth configuration. This is to prevent potential conflicts and ensure consistent behavior. However, you can override this behavior if your use case requires multiple connections.

### Default Behavior

When attempting to create a new connected account, if the user already has an active connection for that auth configuration, Composio will throw a `ComposioMultipleConnectedAccountsError`.

```typescript
// This will throw if the user already has a connection
try {
  await composio.connectedAccounts.initiate('user_123', 'auth_config_123');
} catch (error) {
  if (error instanceof ComposioMultipleConnectedAccountsError) {
    console.log('User already has a connected account for this auth config');
  }
}
```

### Allowing Multiple Connections

If your application needs to support multiple connections for the same auth configuration (e.g., connecting to multiple GitHub accounts), you can enable this by passing the `allowMultiple` option:

```typescript
// This will allow creating multiple connections
const connection = await composio.connectedAccounts.initiate('user_123', 'auth_config_123', {
  allowMultiple: true,
});
```

When `allowMultiple` is enabled:

- Multiple active connections are allowed for the same user and auth configuration
- A warning will be logged to help track this behavior
- You'll need to manage these multiple connections appropriately in your application logic

> **Note:** Be cautious when enabling multiple connections as it may require additional handling in your application to manage which connection to use for specific operations.
