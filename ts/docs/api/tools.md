# Tools API

The `Tools` class provides methods to list, retrieve, and execute tools from various toolkits. It is one of the core components of the Composio SDK.

## Methods

### get(userId, filters, options?)

Retrieves tools based on the provided filters.

```typescript
// Get tools from a specific toolkit
const githubTools = await composio.tools.get('default', {
  toolkits: ['github'],
  limit: 10,
});

// Get tools with search
const searchTools = await composio.tools.get('default', {
  search: 'user',
});

// Get a specific tool by slug
const tool = await composio.tools.get('default', 'GITHUB_GET_REPO');

// Get a tool with schema modifications
const tool = await composio.tools.get('default', 'GITHUB_GET_REPOS', {
  modifySchema: (toolSlug, toolkitSlug, schema) => {
    // Customize the tool schema
    return { ...schema, description: 'Custom description' };
  },
});
```

**Parameters:**

- `userId` (string): The user ID to get the tools for
- `filters` (ToolListParams | string): Either a slug string or filters object
- `options` (ProviderOptions): Optional provider options including modifiers

**Returns:** The wrapped tools collection, formatted according to the provider

### execute(slug, body, modifiers?)

Executes a given tool with the provided parameters.

```typescript
// Execute a Composio API tool
const result = await composio.tools.execute('HACKERNEWS_GET_USER', {
  userId: 'default',
  arguments: { userId: 'pg' },
});

// Execute with modifiers
const result = await composio.tools.execute(
  'GITHUB_GET_ISSUES',
  {
    userId: 'default',
    arguments: { owner: 'composio', repo: 'sdk' },
  },
  {
    beforeExecute: ({ toolSlug, toolkitSlug, params }) => {
      // Modify params before execution
      return params;
    },
    afterExecute: ({ toolSlug, toolkitSlug, result }) => {
      // Transform result after execution
      return result;
    },
  }
);
```

**Parameters:**

- `slug` (string): The slug/ID of the tool to be executed
- `body` (ToolExecuteParams): The parameters to be passed to the tool
- `modifiers` (ExecuteToolModifiers): Optional modifiers to transform the request or response

**Returns:** Promise<ToolExecuteResponse> - The response from the tool execution

**Throws:**

- `ComposioCustomToolsNotInitializedError`: If the CustomTools instance is not initialized
- `ComposioToolNotFoundError`: If the tool with the given slug is not found
- `ComposioToolExecutionError`: If there is an error during tool execution

### createCustomTool(body)

Creates a custom tool that can be used within the Composio SDK.

```typescript
import { z } from 'zod';

const customTool = await composio.tools.createCustomTool({
  name: 'My Custom Tool',
  description: 'A custom tool that does something specific',
  slug: 'MY_CUSTOM_TOOL',
  inputParams: z.object({
    param1: z.string().describe('Description of param1'),
    param2: z.number().optional().describe('Optional numeric parameter')
  }),
  execute: async (input) => {
    // Custom logic here
    console.log('Input:', input.param1, input.param2);
    return { 
      data: { result: 'Success!' },
      error: null,
      successful: true
    };
  },
});
```

**Parameters:**

- `body` (CustomToolOptions): The configuration for the custom tool

**Returns:** Promise<Tool> - The created custom tool

### getRawComposioTools(query?, modifier?)

Lists all tools available in the Composio SDK including custom tools.

```typescript
// Get all tools
const tools = await composio.tools.getRawComposioTools();

// Get tools with filters
const githubTools = await composio.tools.getRawComposioTools({
  toolkits: ['github'],
  important: true,
});

// Get tools with schema transformation
const tools = await composio.tools.getRawComposioTools({}, (toolSlug, toolkitSlug, tool) => {
  // Add custom properties to tool schema
  return { ...tool, customProperty: 'value' };
});
```

**Parameters:**

- `query` (ToolListParams): Optional query parameters to filter the tools
- `modifier` (TransformToolSchemaModifier): Optional function to transform tool schemas

**Returns:** Promise<ToolList> - List of tools matching the query criteria

### getRawComposioToolBySlug(slug, modifier?)

Retrieves a tool by its Slug.

```typescript
const tool = await composio.tools.getRawComposioToolBySlug('HACKERNEWS_GET_USER');
```

**Parameters:**

- `slug` (string): The ID of the tool to be retrieved
- `modifier` (TransformToolSchemaModifier): Optional function to transform tool schema

**Returns:** Promise<Tool> - The tool

## Types

### ToolListParams

```typescript
// You must provide one of the following parameter combinations:
// 1. tools array only
// 2. toolkits with optional important flag
// 3. toolkits with search functionality

type ToolsOnlyParams = {
  tools: string[]; // List of tool slugs to filter by
  toolkits?: never; // Cannot be used with tools
  limit?: never;
  search?: never;
  scopes?: never; 
}

type ToolkitsOnlyParams = {
  tools?: never; // Cannot be used with toolkits
  toolkits: string[]; // List of toolkit slugs to filter by
  limit?: number; // Limit the number of results
  search?: never; // Cannot be used with important flag
  scopes?: string[]; // Optional list of required OAuth scopes
};

type ToolkitSearchOnlyParams = {
  tools?: never; // Cannot be used with search
  toolkits?: string[]; // Optional list of toolkit slugs to filter by
  limit?: number; // Limit the number of results
  search: string; // Search term
  scopes?: string[]; // Optional list of required OAuth scopes
};

type ToolListParams = ToolsOnlyParams | ToolkitsOnlyParams | ToolkitSearchOnlyParams;
```

Note: The parameters are organized into three mutually exclusive combinations:

1. Using `tools` array to fetch specific tools by their slugs
2. Using `toolkits` with optional `important` flag to fetch tools from specific toolkits
3. Using `search` with optional `toolkits` to search for tools by name/description
4. Using `scopes` can only be done with a single `toolkits` slug

You can also filter tools by their scopes:

```typescript
// Get tools with specific scopes
const scopedTools = await composio.tools.get('default', {
  toolkits: ['github'],
  scopes: ['read:repo', 'write:repo'],  // Only get tools requiring these scopes
});

// Search tools with specific scopes
const searchedScopedTools = await composio.tools.get('default', {
  search: 'repository',
  scopes: ['read:repo'],  // Only get tools requiring read:repo scope
  limit: 10,
});
```

The `scopes` parameter allows you to:
- Filter tools based on their required OAuth scopes
- Get tools that match specific permission levels
- Ensure tools align with available user permissions

Examples:

```typescript
// Get specific tools by slug
const specificTools = await composio.tools.get('default', {
  tools: ['GITHUB_GET_REPO', 'GITHUB_LIST_ISSUES'],
});

// Search for tools across all or specific toolkits
const searchResults = await composio.tools.get('default', {
  search: 'repository',
  toolkits: ['github'], // optional
  limit: 10,
});
```

### ToolExecuteParams

```typescript
interface ToolExecuteParams {
  allowTracing?: boolean; // Enable/disable tracing
  connectedAccountId?: string; // Connected account ID
  customAuthParams?: CustomAuthParams; // Custom auth parameters
  customConnectionData?: CustomConnectionData; // Custom connection data
  arguments?: Record<string, unknown>; // Tool arguments
  userId: string; // User ID
  version?: string; // Tool version
  text?: string; // Text input
}
```

### ToolExecuteResponse

```typescript
interface ToolExecuteResponse {
  data: Record<string, unknown>; // Tool execution data
  error: string | null; // Error message (if any)
  successful: boolean; // Whether the execution was successful
  logId?: string; // Log ID for debugging
  sessionInfo?: unknown; // Session information
}
```

### CustomToolOptions

```typescript
interface CustomToolOptions {
  name: string; // Name of the custom tool
  description: string; // Description of the custom tool
  slug: string; // Unique slug for the custom tool
  inputParameters: Record<string, unknown>; // Input parameters schema
  outputParameters?: Record<string, unknown>; // Output parameters schema
  handler: (params: ToolExecuteParams, context: ExecuteMetadata) => Promise<ToolExecuteResponse>; // Handler function
}
```
