# Auth Configs API

The `AuthConfigs` class provides methods to manage authentication configurations for toolkits. Auth configs define how authentication works for a particular toolkit, specifying the auth scheme (OAuth2, API Key, etc.) and other authentication-related details.

## Methods

### list(query?)

Lists all auth configs based on provided filter criteria.

```typescript
// List all auth configs
const allAuthConfigs = await composio.authConfigs.list();

// List auth configs for a specific toolkit
const githubAuthConfigs = await composio.authConfigs.list({
  toolkit: 'github',
});
```

**Parameters:**

- `query` (AuthConfigListParams): Optional query parameters for filtering auth configs

**Returns:** Promise<AuthConfigListResponse> - A paginated list of auth configs

**Throws:** ValidationError if the query fails validation against the expected schema

### get(id)

Retrieves a specific auth config by its ID.

```typescript
// Get an auth config by ID
const authConfig = await composio.authConfigs.get('auth_config_123');
console.log(authConfig.name); // Name of the auth config
```

**Parameters:**

- `id` (string): The unique identifier of the auth config

**Returns:** Promise<AuthConfigRetrieveResponse> - The auth config details

**Throws:** ComposioAuthConfigNotFoundError if the auth config cannot be found

### create(toolkit, data)

Creates a new auth config for a toolkit.

```typescript
// Create an auth config for GitHub
const authConfig = await composio.authConfigs.create('github', {
  type: 'use_composio_managed_auth',
  name: 'GitHub Auth Config',
});
```

**Parameters:**

- `toolkit` (string): The slug of the toolkit to create an auth config for
- `data` (AuthConfigCreateParams): The parameters for creating the auth config

**Returns:** Promise<AuthConfigCreateResponse> - The created auth config

**Throws:**

- ValidationError if the parameters fail validation
- ComposioToolNotFoundError if the toolkit cannot be found

### update(id, data)

Updates an existing auth config.

```typescript
// Update a custom auth config with new credentials
const updatedAuthConfig = await composio.authConfigs.update('auth_config_123', {
  type: 'custom',
  credentials: {
    client_id: 'new_client_id',
    client_secret: 'new_client_secret',
  },
  toolAccessConfig: {
    toolsAvailableForExecution: ['GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER']
  }
});

// Update a default auth config with new scopes
const updatedDefaultAuth = await composio.authConfigs.update('auth_config_456', {
  type: 'default',
  scopes: 'read:user,repo',
  toolAccessConfig: {
    toolsAvailableForExecution: ['GITHUB_GET_A_REPOSITORY', 'GITHUB_LIST_REPOSITORIES_FOR_A_USER']
  }
});
```

**Parameters:**

- `id` (string): The unique identifier of the auth config to update
- `data` (AuthConfigUpdateParams): The parameters for updating the auth config. Must be a discriminated union with either:
  - `{ type: 'custom', credentials: Record<string, unknown>, toolAccessConfig?: {...} }`
  - `{ type: 'default', scopes: string, toolAccessConfig?: {...} }`

**Returns:** Promise<AuthConfigUpdateResponse> - The updated auth config

**Throws:** 
- ValidationError if the update parameters are invalid
- ComposioAuthConfigNotFoundError if the auth config cannot be found

### delete(id)

Deletes an auth config.

```typescript
// Delete an auth config
await composio.authConfigs.delete('auth_config_123');
```

**Parameters:**

- `id` (string): The unique identifier of the auth config to delete

**Returns:** Promise<AuthConfigDeleteResponse> - The deletion response

**Throws:** Error if the auth config doesn't exist or cannot be deleted

## Types

### AuthConfigListParams

```typescript
interface AuthConfigListParams {
  cursor?: string; // Pagination cursor
  limit?: number; // Limit the number of results
  orderBy?: string; // Order by field
  toolkit?: string; // Filter by toolkit slug
}
```

### AuthConfigListResponse

```typescript
interface AuthConfigListResponse {
  items: AuthConfigRetrieveResponse[]; // List of auth configs
  nextCursor: string | null; // Pagination cursor
  totalPages: number; // Total number of pages
}
```

### AuthConfigRetrieveResponse

```typescript
interface AuthConfigRetrieveResponse {
  id: string; // Auth config ID
  name: string; // Name of the auth config
  type: AuthConfigType; // Type of auth config
  toolkit: {
    // Associated toolkit
    id: string; // Toolkit ID
    slug: string; // Toolkit slug
    name: string; // Toolkit name
  };
  authScheme: AuthSchemeType; // Auth scheme (e.g., 'oauth2', 'api_key')
  isDisabled: boolean; // Whether the auth config is disabled
  fields: Record<string, unknown>; // Configuration fields
  meta: Record<string, unknown>; // Additional metadata
  createdAt: string; // Creation timestamp
  updatedAt: string; // Last update timestamp
}
```

### AuthConfigCreateParams

```typescript
interface AuthConfigCreateParams {
  type: AuthConfigType; // Type of auth config
  name: string; // Name of the auth config
  fields?: Record<string, unknown>; // Configuration fields
}
```

### AuthConfigUpdateParams

```typescript
// Discriminated union type for updating auth configs
type AuthConfigUpdateParams = 
  | {
      type: 'custom';
      credentials: Record<string, string | number | boolean | unknown>;
      toolAccessConfig?: {
        toolsAvailableForExecution?: string[];
        toolsForConnectedAccountCreation?: string[];
      };
      /** @deprecated Use toolAccessConfig instead */
      restrictToFollowingTools?: string[];
    }
  | {
      type: 'default';
      scopes: string;
      toolAccessConfig?: {
        toolsAvailableForExecution?: string[];
        toolsForConnectedAccountCreation?: string[];
      };
      /** @deprecated Use toolAccessConfig instead */
      restrictToFollowingTools?: string[];
    };
```

### AuthConfigType

Auth config types are defined as an enum:

```typescript
enum AuthConfigTypes {
  USE_COMPOSIO_MANAGED_AUTH = 'use_composio_managed_auth',
  SERVICE_CONNECTION = 'service_connection',
  USER_CREDENTIALS = 'user_credentials',
  CUSTOM_AUTH = 'custom_auth',
  NO_AUTH = 'no_auth',
}
```

### AuthSchemeType

Auth scheme types are defined as an enum:

```typescript
enum AuthSchemeTypes {
  OAUTH2 = 'oauth2',
  API_KEY = 'api_key',
  BASIC_AUTH = 'basic_auth',
  CUSTOM = 'custom',
  NO_AUTH = 'no_auth',
}
```
