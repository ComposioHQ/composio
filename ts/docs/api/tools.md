# Tools API

The `Tools` class provides methods to list, retrieve, and execute tools from various toolkits. It is one of the core components of the Composio SDK.

## Methods

### get(userId, filters, options?)

Retrieves and wraps tools based on the provided filters. Tool versions are controlled at the Composio SDK initialization level through the `toolkitVersions` configuration. See [Toolkit Versions Configuration](../getting-started.md#toolkit-versions) for more details on version management.

**Note:** When fetching tools by `toolkits` or `search`, if no `limit` is provided, the API defaults to returning 20 tools. To fetch all available tools, explicitly specify a `limit` value up to the maximum of 999.

#### Overload 1: Get multiple tools with filters

```typescript
// Get tools from a specific toolkit
const githubTools = await composio.tools.get('default', {
  toolkits: ['github'],
  limit: 10
});

// Get tools with search (defaults to 20 if limit not provided)
const searchTools = await composio.tools.get('default', {
  search: 'user'
});

// Get all tools (up to maximum of 999)
const allTools = await composio.tools.get('default', {
  toolkits: ['github'],
  limit: 999
});

// Get tools with schema modifications
const customizedTools = await composio.tools.get('default', {
  toolkits: ['github'],
  limit: 5
}, {
  modifySchema: ({ toolSlug, toolkitSlug, schema }) => {
    return { ...schema, description: 'Custom description' };
  }
});
```

**Parameters:**
- `userId` (string): The user ID to get the tools for
- `filters` (ToolListParams): Filters object to specify which tools to retrieve
  - `limit` (number, optional): Limit on the number of tools to return. Defaults to 20 if not provided when using `toolkits` or `search` filters. Maximum value is 999.
- `options` (ProviderOptions): Optional provider options including modifiers

#### Overload 2: Get a specific tool by slug

```typescript
// Get a specific tool by slug
const tool = await composio.tools.get('default', 'GITHUB_GET_REPO');

// Get a tool with schema modifications
const customTool = await composio.tools.get('default', 'GITHUB_GET_REPOS', {
  modifySchema: ({ toolSlug, toolkitSlug, schema }) => {
    return { ...schema, description: 'Enhanced GitHub repository tool' };
  }
});
```

**Parameters:**
- `userId` (string): The user ID to get the tool for
- `slug` (string): The slug of the specific tool to fetch
- `options` (ProviderOptions): Optional provider options including modifiers

**Returns:** The wrapped tools collection, formatted according to the provider being used

### execute(slug, body, modifiers?)

Executes a given tool with the provided parameters manually.

> **Important:** When manually executing tools (especially in workflows), a specific version is **required**. The method will throw an error if toolkitVersion is not provided or `latest` is used as the version. This ensures there are no mismatches in tool arguments when new versions are released. You can bypass this requirement using `dangerouslySkipVersionCheck: true`, but this is **not recommended for production**.

```typescript
// Execute with a pinned version (REQUIRED for workflows and manual execution)
const result = await composio.tools.execute('GITHUB_GET_ISSUES', {
  userId: 'default',
  arguments: { owner: 'composio', repo: 'sdk' },
  version: '12082025_00', // Specific version required
});

// Or configure versions at initialization (RECOMMENDED)
const composio = new Composio({
  toolkitVersions: { 
    github: '12082025_00',
    slack: '10082025_01'
  }
});

const result = await composio.tools.execute('GITHUB_GET_ISSUES', {
  userId: 'default',
  arguments: { owner: 'composio', repo: 'sdk' },
  // Uses pinned version from initialization
});

// Execute with dangerouslySkipVersionCheck (NOT recommended for production)
// This allows using 'latest' version and bypasses version validation
const result = await composio.tools.execute('SLACK_SEND_MESSAGE', {
  userId: 'default',
  arguments: { channel: '#general', text: 'Hello!' },
  dangerouslySkipVersionCheck: true, // Skip version validation (use with caution)
});

// Execute with modifiers
const result = await composio.tools.execute(
  'GITHUB_GET_ISSUES',
  {
    userId: 'default',
    arguments: { owner: 'composio', repo: 'sdk' },
    version: '12082025_00', // Always specify version
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

#### Version Requirements for Manual Tool Execution

When building workflows that require manually executing tools, **a specific pinned version is mandatory**. Using `'latest'` is not allowed and will throw an error. This strict requirement prevents argument mismatches that can occur when tool schemas change in newer versions.

**Why Version Pinning is Required:**
- Tool argument schemas can change between versions
- Using `'latest'` in workflows can cause runtime errors when tools are updated
- Pinned versions ensure workflow stability and predictability
- Version validation prevents production issues from schema mismatches

**Three Approaches to Handle Versions:**

**1. Specify a concrete version in the execute call** (Recommended):
```typescript
const result = await composio.tools.execute('GITHUB_GET_ISSUES', {
  userId: 'default',
  arguments: { owner: 'composio', repo: 'sdk' },
  version: '12082025_00', // Explicit version for this tool
});
```

**2. Configure toolkit versions at initialization** (Recommended for production):
```typescript
const composio = new Composio({
  toolkitVersions: { 
    github: '12082025_00',
    slack: '10082025_01'
  }
});

// Now execute without version parameter - uses pinned version from config
const result = await composio.tools.execute('GITHUB_GET_ISSUES', {
  userId: 'default',
  arguments: { owner: 'composio', repo: 'sdk' },
});
```

**3. Use `dangerouslySkipVersionCheck: true`** (NOT recommended for production):
```typescript
const result = await composio.tools.execute('GITHUB_GET_ISSUES', {
  userId: 'default',
  arguments: { owner: 'composio', repo: 'sdk' },
  dangerouslySkipVersionCheck: true, // Bypasses version validation and uses 'latest'
});
```

> ⚠️ **Warning:** Using `dangerouslySkipVersionCheck: true` bypasses version validation and allows the use of `'latest'` version. This can lead to unexpected behavior and argument mismatches when tool schemas change. **Only use this flag during development or testing.** Always pin specific versions in production environments to ensure workflow stability.

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

### getRawComposioTools(query, options?)

Lists all tools available in the Composio SDK including custom tools. This method provides direct access to tool data without provider-specific wrapping.

**Note:** When fetching tools by `toolkits` or `search`, if no `limit` is provided, the API defaults to returning 20 tools. To fetch all available tools, explicitly specify a `limit` value up to the maximum of 999.

```typescript
// Get tools from specific toolkits
const githubTools = await composio.tools.getRawComposioTools({
  toolkits: ['github'],
  limit: 10
});

// Get specific tools by slug
const specificTools = await composio.tools.getRawComposioTools({
  tools: ['GITHUB_GET_REPOS', 'HACKERNEWS_GET_USER']
});

// Get tools from specific toolkits (defaults to 20 if limit not provided)
const githubTools = await composio.tools.getRawComposioTools({
  toolkits: ['github']
});

// Get all tools (up to maximum of 999)
const allTools = await composio.tools.getRawComposioTools({
  toolkits: ['github'],
  limit: 999
});

// Get tools with schema transformation
const customizedTools = await composio.tools.getRawComposioTools({
  toolkits: ['github'],
  limit: 5
}, {
  modifySchema: ({ toolSlug, toolkitSlug, schema }) => {
    return {
      ...schema,
      customProperty: `Modified ${toolSlug} from ${toolkitSlug}`,
      tags: [...(schema.tags || []), 'customized']
    };
  }
});

// Search for tools (defaults to 20 if limit not provided)
const searchResults = await composio.tools.getRawComposioTools({
  search: 'user management'
});
```

**Parameters:**

- `query` (ToolListParams): Query parameters to filter the tools (required)
  - `limit` (number, optional): Limit on the number of tools to return. Defaults to 20 if not provided when using `toolkits` or `search` filters. Maximum value is 999.
- `options` (GetRawComposioToolsOptions): Optional configuration for tool retrieval
  - `modifySchema` (TransformToolSchemaModifier): Function to transform tool schemas

**Returns:** Promise<ToolList> - List of tools matching the query criteria

### getRawComposioToolBySlug(slug, options?)

Retrieves a specific tool by its slug from the Composio API. This method provides direct access to tool schema and metadata without provider-specific wrapping.

```typescript
// Get a tool by slug
const tool = await composio.tools.getRawComposioToolBySlug('GITHUB_GET_REPOS');

// Get a tool with schema transformation
const customizedTool = await composio.tools.getRawComposioToolBySlug(
  'SLACK_SEND_MESSAGE',
  {
    modifySchema: ({ toolSlug, toolkitSlug, schema }) => {
      return {
        ...schema,
        description: `Enhanced ${schema.description} with custom modifications`,
        customMetadata: {
          lastModified: new Date().toISOString(),
          toolkit: toolkitSlug
        }
      };
    }
  }
);

// Access tool properties
const githubTool = await composio.tools.getRawComposioToolBySlug('GITHUB_CREATE_ISSUE');
console.log({
  slug: githubTool.slug,
  name: githubTool.name,
  toolkit: githubTool.toolkit?.name,
  version: githubTool.version,
  availableVersions: githubTool.availableVersions
});
```

**Parameters:**

- `slug` (string): The unique identifier of the tool (e.g., 'GITHUB_GET_REPOS')
- `options` (GetRawComposioToolBySlugOptions): Optional configuration for tool retrieval
  - `modifySchema` (TransformToolSchemaModifier): Function to transform the tool schema

**Returns:** Promise<Tool> - The requested tool with its complete schema and metadata

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
  limit?: number; // Limit the number of results (defaults to 20, maximum 999)
  search?: never; // Cannot be used with important flag
  scopes?: string[]; // Optional list of required OAuth scopes
};

type ToolkitSearchOnlyParams = {
  tools?: never; // Cannot be used with search
  toolkits?: string[]; // Optional list of toolkit slugs to filter by
  limit?: number; // Limit the number of results (defaults to 20, maximum 999)
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
// Note: If limit is not provided, defaults to 20. Maximum limit is 999.
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
  userId: string; // User ID (required)
  version?: string; // Tool version (e.g., '12082025_00') - overrides global toolkit version
  dangerouslySkipVersionCheck?: boolean; // Skip version validation (NOT recommended for production)
  text?: string; // Text input
}
```

**Parameter Details:**

- **`version`** (string, conditionally required): Specifies the toolkit version to use for this tool execution. **Required when manually executing tools** unless a specific version is configured at initialization or `dangerouslySkipVersionCheck` is set to `true`. Using `'latest'` will throw a `ValidationError` to prevent schema mismatches in workflows. Format: `'DDMMYYYY_NN'` (e.g., `'12082025_00'`). See [Toolkit Versions Configuration](../getting-started.md#toolkit-versions) for more details.

- **`dangerouslySkipVersionCheck`** (boolean, optional): When set to `true`, bypasses version validation during tool execution and allows using `'latest'` version. This is useful for development and testing but **NOT recommended for production** as it can lead to unexpected behavior and argument mismatches when tool schemas change. Always pin specific toolkit versions at initialization or pass a `version` parameter in production environments.

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

