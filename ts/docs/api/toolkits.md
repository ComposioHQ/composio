# Toolkits API

The `Toolkits` class provides methods to list, retrieve, and manage toolkits. Toolkits are collections of related tools provided by a single service (like GitHub, Gmail, etc.).

## Methods

### get(slug)

Retrieves a specific toolkit by its slug identifier.

```typescript
// Get a specific toolkit
const githubToolkit = await composio.toolkits.get('github');
console.log(githubToolkit.name); // GitHub
console.log(githubToolkit.authConfigDetails); // Authentication configuration details
```

**Parameters:**

- `slug` (string): The unique slug identifier of the toolkit to retrieve

**Returns:** Promise<ToolkitRetrieveResponse> - The toolkit object with detailed information

**Throws:** ComposioToolNotFoundError if no toolkit with the given slug exists

### get(query)

Retrieves a list of toolkits based on the provided query parameters.

```typescript
// Get all toolkits
const allToolkits = await composio.toolkits.get({});

// Get toolkits by category
const devToolkits = await composio.toolkits.get({
  category: 'developer-tools',
});

// Get local toolkits
const localToolkits = await composio.toolkits.get({
  isLocal: true,
});
```

**Parameters:**

- `query` (ToolkitListParams): The query parameters to filter toolkits

**Returns:** Promise<ToolKitListResponse> - A paginated list of toolkits matching the query criteria

### listCategories()

Retrieves all toolkit categories available in the Composio SDK.

```typescript
// Get all toolkit categories
const categories = await composio.toolkits.listCategories();
console.log(categories.items); // Array of category objects
```

**Returns:** Promise<ToolkitRetrieveCategoriesResponse> - The list of toolkit categories

### authorize(userId, toolkitSlug)

Authorizes a user to use a toolkit. This method will create an auth config if one doesn't exist and initiate a connection request.

```typescript
// Authorize a user to use GitHub
const connectionRequest = await composio.toolkits.authorize('user123', 'github');

// Use the connection request to complete the authorization process
console.log(connectionRequest.redirectUrl); // URL to redirect the user for authorization
```

**Parameters:**

- `userId` (string): The user ID of the user to authorize
- `toolkitSlug` (string): The slug of the toolkit to authorize

**Returns:** Promise<ConnectionRequest> - The connection request object

### getAuthConfigCreationFields(toolkitSlug, options)

Retrieves the fields required for creating an auth config for a toolkit.

```typescript
// Get all fields for creating an auth config
const fields = await composio.toolkits.getAuthConfigCreationFields('github');

// Get only required fields for a specific auth scheme
const requiredFields = await composio.toolkits.getAuthConfigCreationFields('github', {
  authScheme: 'OAUTH2',
  requiredOnly: true,
});
```

Example Response:

```json
{
  "authScheme": "OAUTH2",
  "fields": [
    {
      "name": "client_id",
      "displayName": "Client id",
      "type": "string",
      "required": true
    },
    {
      "name": "client_secret",
      "displayName": "Client secret",
      "type": "string",
      "required": true
    },
    {
      "name": "oauth_redirect_uri",
      "displayName": "Redirect URI",
      "type": "string",
      "default": "https://backend.composio.dev/api/v1/auth-apps/add",
      "required": false
    },
    {
      "name": "scopes",
      "displayName": "Scopes",
      "type": "string",
      "default": "read_products,write_products,read_orders,write_orders",
      "required": false
    }
  ]
}
```

**Parameters:**

- `toolkitSlug` (string): The slug of the toolkit to retrieve the fields for
- `options` (object, optional):
  - `authScheme` (string, optional): The auth scheme to retrieve the fields for (e.g., 'OAUTH2', 'API_KEY')
  - `requiredOnly` (boolean, optional): Whether to only return the required fields (default: false)

**Returns:** Promise<ToolkitAuthFieldsResponse> - The authschem and fields required for creating an auth config

**Throws:** ComposioAuthConfigNotFoundError if no auth config is found for the toolkit or the specified auth scheme

### getConnectedAccountInitiationFields(toolkitSlug, options)

Retrieves the fields required for initiating a connected account for a toolkit.

```typescript
// Get all fields for initiating a connected account
const fields = await composio.toolkits.getConnectedAccountInitiationFields('github');

// Get only required fields for a specific auth scheme
const requiredFields = await composio.toolkits.getConnectedAccountInitiationFields('github', {
  authScheme: 'OAUTH2',
  requiredOnly: true,
});
```

Example Response:

```json
{
  "authScheme": "OAUTH2",
  "fields": [
    {
      "name": "shop",
      "displayName": "Store Subdomain",
      "type": "string",
      "default": null,
      "required": true
    }
  ]
}
```

**Parameters:**

- `toolkitSlug` (string): The slug of the toolkit to retrieve the fields for
- `options` (object, optional):
  - `authScheme` (string, optional): The auth scheme to retrieve the fields for (e.g., 'OAUTH2', 'API_KEY')
  - `requiredOnly` (boolean, optional): Whether to only return the required fields (default: false)

**Returns:** Promise<ToolkitAuthFieldsResponse> - The auth schemes and fields required for initiating a connected account

**Throws:** ComposioAuthConfigNotFoundError if no auth config is found for the toolkit or the specified auth scheme

## Types

### ToolkitListParams

```typescript
interface ToolkitListParams {
  category?: string; // Filter by category
  isLocal?: boolean; // Filter for local toolkits
  managedBy?: string; // Filter by manager
  sortBy?: string; // Sort results by this field
}
```

### ToolKitListResponse

```typescript
interface ToolKitListResponse {
  items: ToolKitItem[]; // List of toolkits
  nextCursor?: string | null; // Pagination cursor
  totalPages: number; // Total number of pages
}
```

### ToolKitItem

```typescript
interface ToolKitItem {
  name: string; // Name of the toolkit
  slug: string; // Unique slug identifier
  meta: {
    // Metadata about the toolkit
    createdAt: string; // When the toolkit was created
    updatedAt: string; // When the toolkit was last updated
    toolsCount: number; // Number of tools in the toolkit
    triggersCount: number; // Number of triggers in the toolkit
  };
  isLocalToolkit: boolean; // Whether this is a local toolkit
  authSchemes: string[]; // Available authentication schemes
  composioManagedAuthSchemes: string[]; // Managed auth schemes
  noAuth: boolean; // Whether authentication is required
}
```

### ToolkitRetrieveResponse

```typescript
interface ToolkitRetrieveResponse {
  name: string; // Name of the toolkit
  slug: string; // Unique slug identifier
  meta: {
    // Metadata about the toolkit
    createdAt: string; // When the toolkit was created
    updatedAt: string; // When the toolkit was last updated
    toolsCount: number; // Number of tools in the toolkit
    triggersCount: number; // Number of triggers in the toolkit
  };
  isLocalToolkit: boolean; // Whether this is a local toolkit
  composioManagedAuthSchemes: string[]; // Managed auth schemes
  authConfigDetails: {
    // Authentication configuration details
    name: string; // Name of the auth configuration
    mode: string; // Auth mode (e.g., "OAUTH2")
    fields: {
      // Required fields
      authConfigCreation: Record<string, unknown>; // Fields for creating auth config
      connectedAccountInitiation: Record<string, unknown>; // Fields for initiating connection
    };
    proxy?: {
      // Proxy configuration (if any)
      baseUrl: string; // Base URL for proxied requests
    };
  }[];
}
```

### ToolkitRetrieveCategoriesResponse

```typescript
interface ToolkitRetrieveCategoriesResponse {
  items: ToolkitCategory[]; // List of categories
  nextCursor?: string | null; // Pagination cursor
  totalPages: number; // Total number of pages
}
```

### ToolkitCategory

```typescript
interface ToolkitCategory {
  id: string; // Category ID
  name: string; // Category name
}
```
