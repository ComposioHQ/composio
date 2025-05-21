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
  category: 'developer-tools'
});

// Get local toolkits
const localToolkits = await composio.toolkits.get({
  isLocal: true
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

## Types

### ToolkitListParams

```typescript
interface ToolkitListParams {
  category?: string;       // Filter by category
  isLocal?: boolean;       // Filter for local toolkits
  managedBy?: string;      // Filter by manager
  sortBy?: string;         // Sort results by this field
}
```

### ToolKitListResponse

```typescript
interface ToolKitListResponse {
  items: ToolKitItem[];       // List of toolkits
  nextCursor?: string | null; // Pagination cursor
  totalPages: number;         // Total number of pages
}
```

### ToolKitItem

```typescript
interface ToolKitItem {
  name: string;             // Name of the toolkit
  slug: string;             // Unique slug identifier
  meta: {                   // Metadata about the toolkit
    createdAt: string;      // When the toolkit was created
    updatedAt: string;      // When the toolkit was last updated
    toolsCount: number;     // Number of tools in the toolkit
    triggersCount: number;  // Number of triggers in the toolkit
  };
  isLocalToolkit: boolean;  // Whether this is a local toolkit
  authSchemes: string[];    // Available authentication schemes
  composioManagedAuthSchemes: string[]; // Managed auth schemes
  noAuth: boolean;          // Whether authentication is required
}
```

### ToolkitRetrieveResponse

```typescript
interface ToolkitRetrieveResponse {
  name: string;             // Name of the toolkit
  slug: string;             // Unique slug identifier
  meta: {                   // Metadata about the toolkit
    createdAt: string;      // When the toolkit was created
    updatedAt: string;      // When the toolkit was last updated
    toolsCount: number;     // Number of tools in the toolkit
    triggersCount: number;  // Number of triggers in the toolkit
  };
  isLocalToolkit: boolean;  // Whether this is a local toolkit
  composioManagedAuthSchemes: string[]; // Managed auth schemes
  authConfigDetails: {      // Authentication configuration details
    name: string;           // Name of the auth configuration
    mode: string;           // Auth mode (e.g., "OAUTH2")
    fields: {               // Required fields
      authConfigCreation: Record<string, unknown>;      // Fields for creating auth config
      connectedAccountInitiation: Record<string, unknown>; // Fields for initiating connection
    };
    proxy?: {              // Proxy configuration (if any)
      baseUrl: string;     // Base URL for proxied requests
    };
  }[];
}
```

### ToolkitRetrieveCategoriesResponse

```typescript
interface ToolkitRetrieveCategoriesResponse {
  items: ToolkitCategory[]; // List of categories
  nextCursor?: string | null; // Pagination cursor
  totalPages: number;       // Total number of pages
}
```

### ToolkitCategory

```typescript
interface ToolkitCategory {
  id: string;               // Category ID
  name: string;             // Category name
}
```