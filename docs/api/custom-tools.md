# Custom Tools API

Custom Tools allow you to extend Composio's functionality by creating your own tools with custom logic. These tools can be used alongside the built-in tools provided by Composio.

## Creating Custom Tools

You can create custom tools using the `createCustomTool` method of the `Tools` class:

```typescript
const customTool = await composio.tools.createCustomTool({
  name: 'My Custom Tool',
  description: 'A custom tool that does something specific',
  slug: 'MY_CUSTOM_TOOL',
  inputParameters: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'First parameter',
      },
      param2: {
        type: 'number',
        description: 'Second parameter',
      }
    },
    required: ['param1']
  },
  outputParameters: {
    type: 'object',
    properties: {
      result: {
        type: 'string',
        description: 'The result of the operation'
      }
    }
  },
  handler: async (params, context) => {
    // Custom logic here
    const { param1, param2 } = params.arguments;
    
    // Return a successful response
    return { 
      data: { 
        result: `Processed ${param1} with value ${param2}` 
      },
      successful: true,
      error: null
    };
  }
});
```

## Custom Tool Options

When creating a custom tool, you need to specify the following options:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | The name of the custom tool |
| `description` | string | Yes | A description of what the tool does |
| `slug` | string | Yes | A unique identifier for the tool (usually uppercase with underscores) |
| `inputParameters` | JSONSchema | Yes | The JSON Schema defining the input parameters |
| `outputParameters` | JSONSchema | No | The JSON Schema defining the output parameters |
| `handler` | function | Yes | The function that implements the tool's logic |

## Handler Function

The handler function is where you implement the custom tool's logic. It receives the following parameters:

1. `params`: The parameters passed to the tool, including:
   - `arguments`: The input arguments as defined in `inputParameters`
   - `userId`: The ID of the user executing the tool
   - `connectedAccountId`: (optional) The ID of the connected account to use
   - Additional properties as defined in `ToolExecuteParams`

2. `context`: Execution metadata, including:
   - `userId`: The ID of the user executing the tool
   - `connectedAccountId`: (optional) The ID of the connected account being used

The handler must return a `ToolExecuteResponse` object with the following structure:

```typescript
{
  data: Record<string, unknown>, // The output data matching the outputParameters schema
  error: string | null,          // Error message (if any)
  successful: boolean,           // Whether the execution was successful
  logId?: string,                // Optional log ID for debugging
  sessionInfo?: unknown          // Optional session information
}
```

## JSON Schema for Parameters

Both `inputParameters` and `outputParameters` should be defined using JSON Schema:

```typescript
const inputParametersSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'The search query'
    },
    limit: {
      type: 'integer',
      description: 'Maximum number of results',
      default: 10
    }
  },
  required: ['query']
};

const outputParametersSchema = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          url: { type: 'string' }
        }
      },
      description: 'Search results'
    },
    totalCount: {
      type: 'integer',
      description: 'Total number of results found'
    }
  }
};
```

## Error Handling in Custom Tools

Your handler function should handle errors gracefully:

```typescript
handler: async (params, context) => {
  try {
    // Custom logic here
    const { query, limit = 10 } = params.arguments;
    
    // Simulate an API call
    const results = await searchApi(query, limit);
    
    return {
      data: {
        results,
        totalCount: results.length
      },
      successful: true,
      error: null
    };
  } catch (error) {
    // Handle errors
    return {
      data: {},
      successful: false,
      error: error.message || 'An error occurred during tool execution'
    };
  }
}
```

## Using Connected Accounts in Custom Tools

You can use connected accounts in your custom tools to access authenticated services:

```typescript
handler: async (params, context) => {
  const { userId, connectedAccountId } = context;
  
  if (!connectedAccountId) {
    return {
      data: {},
      successful: false,
      error: 'No connected account provided'
    };
  }
  
  try {
    // Get the connected account details
    const connectedAccount = await composio.connectedAccounts.get(connectedAccountId);
    
    // Use the authentication tokens
    const accessToken = connectedAccount.meta.access_token;
    
    // Make authenticated API calls
    const apiResult = await callExternalApi(accessToken, params.arguments);
    
    return {
      data: apiResult,
      successful: true,
      error: null
    };
  } catch (error) {
    return {
      data: {},
      successful: false,
      error: error.message
    };
  }
}
```

## Accessing Custom Tools

Once created, custom tools can be accessed just like built-in tools:

```typescript
// Get the custom tool
const tool = await composio.tools.get('default', 'MY_CUSTOM_TOOL');

// Execute the custom tool
const result = await composio.tools.execute('MY_CUSTOM_TOOL', {
  userId: 'default',
  arguments: {
    param1: 'value1',
    param2: 42
  }
});

console.log(result.data); // { result: "Processed value1 with value 42" }
```

## Types

### CustomToolOptions

```typescript
interface CustomToolOptions {
  name: string;
  description: string;
  slug: string;
  inputParameters: JSONSchema;
  outputParameters?: JSONSchema;
  handler: (
    params: ToolExecuteParams, 
    context: ExecuteMetadata
  ) => Promise<ToolExecuteResponse>;
}
```

### ExecuteMetadata

```typescript
interface ExecuteMetadata {
  userId: string;
  connectedAccountId?: string;
}
```

### ToolExecuteParams

```typescript
interface ToolExecuteParams {
  allowTracing?: boolean;
  connectedAccountId?: string;
  customAuthParams?: CustomAuthParams;
  arguments: Record<string, unknown>;
  userId: string;
  version?: string;
  text?: string;
}
```

### ToolExecuteResponse

```typescript
interface ToolExecuteResponse {
  data: Record<string, unknown>;
  error: string | null;
  successful: boolean;
  logId?: string;
  sessionInfo?: unknown;
}
```