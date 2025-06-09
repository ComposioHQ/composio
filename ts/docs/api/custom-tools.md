# Custom Tools

Custom tools allow you to create your own tools that can be used with Composio. There are two types of custom tools:

1. Standalone Tools - Simple tools that don't require any authentication
2. Toolkit-based Tools - Tools that require authentication and can use toolkit credentials

## Creating a Custom Tool

### Standalone Tool

A standalone tool is the simplest form of custom tool. It only requires input parameters and an execute function:

```typescript
const tool = await composio.tools.createCustomTool({
  slug: 'CALCULATE_SQUARE',
  name: 'Calculate Square',
  description: 'Calculates the square of a number',
  inputParams: z.object({
    number: z.number().describe('The number to calculate the square of'),
  }),
  execute: async input => {
    const { number } = input;
    return {
      data: { result: number * number },
      error: null,
      successful: true,
    };
  },
});
```

### Toolkit-based Tool

A toolkit-based tool has access to two ways of making authenticated requests:

1. Using `executeToolRequest` - The recommended way to make authenticated requests to the toolkit's API endpoints. Composio automatically handles credential injection and baseURL resolution:

```typescript
const tool = await composio.tools.createCustomTool({
  slug: 'GITHUB_STAR_COMPOSIOHQ_REPOSITORY',
  name: 'Github star composio repositories',
  toolkitSlug: 'github',
  description: 'For any given repository of the user composiohq, star the repository',
  inputParams: z.object({
    repository: z.string().describe('The repository to star'),
    page: z.number().optional().describe('Page number for pagination'),
    customHeader: z.string().optional().describe('Custom header value'),
  }),
  execute: async (input, authCredentials, executeToolRequest) => {
    // executeToolRequest makes authenticated requests to the toolkit's API
    // You can use relative paths - Composio will automatically inject the baseURL
    const result = await executeToolRequest({
      endpoint: `/user/starred/composiohq/${input.repository}`,
      method: 'PUT',
      body: {},
      // Add custom headers or query parameters
      parameters: [
        // Add query parameters
        {
          name: 'page',
          value: input.page?.toString() || '1',
          in: 'query',
        },
        // Add custom headers
        {
          name: 'x-custom-header',
          value: input.customHeader || 'default-value',
          in: 'header',
        },
      ],
    });
    return result;
  },
});
```

2. Using `authCredentials` - For making direct API calls when needed:

```typescript
const tool = await composio.tools.createCustomTool({
  slug: 'GITHUB_DIRECT_API',
  name: 'Direct GitHub API Call',
  description: 'Makes direct calls to GitHub API',
  toolkitSlug: 'github',
  inputParams: z.object({
    repo: z.string().describe('Repository name'),
  }),
  execute: async (input, authCredentials, executeToolRequest) => {
    // Use authCredentials for direct API calls
    const result = await fetch(`https://api.github.com/repos/${input.repo}`, {
      headers: {
        Authorization: `Bearer ${authCredentials.access_token}`,
      },
    });

    return {
      data: await result.json(),
      error: null,
      successful: true,
    };
  },
});
```

### Using Custom Headers and Query Parameters

You can add custom headers and query parameters to your toolkit-based tools using the `parameters` option in `executeToolRequest`:

```typescript
const tool = await composio.tools.createCustomTool({
  slug: 'GITHUB_SEARCH_REPOSITORIES',
  name: 'Search GitHub Repositories',
  description: 'Search for repositories with custom parameters',
  toolkitSlug: 'github',
  inputParams: z.object({
    query: z.string().describe('Search query'),
    perPage: z.number().optional().describe('Results per page'),
    acceptType: z.string().optional().describe('Custom accept header'),
  }),
  execute: async (input, authCredentials, executeToolRequest) => {
    const result = await executeToolRequest({
      endpoint: '/search/repositories',
      method: 'GET',
      parameters: [
        // Add query parameters for pagination
        {
          name: 'q',
          value: input.query,
          in: 'query',
        },
        {
          name: 'per_page',
          value: (input.perPage || 30).toString(),
          in: 'query',
        },
        // Add custom headers
        {
          name: 'Accept',
          value: input.acceptType || 'application/vnd.github.v3+json',
          in: 'header',
        },
        {
          name: 'X-Custom-Header',
          value: 'custom-value',
          in: 'header',
        },
      ],
    });
    return result;
  },
});
```

## Executing Custom Tools

You can execute custom tools just like any other tool:

```typescript
const result = await composio.tools.execute('TOOL_SLUG', {
  arguments: {
    // Tool input parameters
  },
  userId: 'user-id',
  connectedAccountId: 'optional-account-id', // Required for toolkit-based tools
});
```

## Type Safety

The custom tools implementation provides full type safety:

1. Input parameters are validated using Zod schemas
2. The execute function's parameters are inferred based on whether toolkitSlug is provided:
   - Without toolkitSlug: `(input) => Promise<ToolExecuteResponse>`
   - With toolkitSlug: `(input, authCredentials, executeToolRequest) => Promise<ToolExecuteResponse>`

## Best Practices

1. Use descriptive names and slugs for your tools
2. Always provide descriptions for input parameters using `describe()`
3. Handle errors gracefully in your execute function
4. For toolkit-based tools:
   - Prefer `executeToolRequest` over direct API calls when possible
   - Use relative paths with `executeToolRequest` - Composio will automatically inject the correct baseURL
   - Use the `parameters` option to add custom headers or query parameters:
     ```typescript
     parameters: [
       { name: 'page', value: '1', in: 'query' }, // Adds ?page=1 to URL
       { name: 'x-custom', value: 'value', in: 'header' }, // Adds header
     ];
     ```
   - Remember that `executeToolRequest` can only call tools from the same toolkit
   - Use `executeToolRequest` to leverage Composio's automatic credential handling
   - Only use `authCredentials` when you need to make direct API calls or interact with different services
5. Chain multiple toolkit operations using `executeToolRequest` for better maintainability

## Limitations

1. Custom tools are stored in memory and are not persisted
2. They need to be recreated when the application restarts
3. Toolkit-based tools require a valid connected account with the specified toolkit
4. `executeToolRequest` can only execute tools from the same toolkit that the custom tool belongs to
5. Each toolkit-based tool can only use one connected account at a time
