# Error Handling in Composio SDK

Proper error handling is essential for building robust applications with the Composio SDK. This guide explains the error classes provided by the SDK and how to handle errors effectively.

## Error Hierarchy

Composio SDK provides a structured error hierarchy:

- `ComposioError`: The base error class for all Composio errors
  - `AuthConfigErrors`: Errors related to authentication configurations
  - `ConnectedAccountsError`: Errors related to connected accounts
  - `ConnectionRequestError`: Errors related to connection requests
  - `ToolErrors`: Errors related to tools and tool execution
  - `ToolkitErrors`: Errors related to toolkits
  - `ValidationError`: Errors related to input validation

## Common Error Types

### Validation Errors

Validation errors occur when the input to a method doesn't match the expected schema:

```typescript
try {
  await composio.tools.get('default', {
    invalidParam: 'value', // This will cause a validation error
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation error:', error.message);
    console.error('Validation details:', error.validationError);
  }
}
```

### Tool Execution Errors

Errors that occur during tool execution:

```typescript
try {
  const result = await composio.tools.execute('GITHUB_GET_REPO', {
    userId: 'default',
    arguments: {
      owner: 'composio',
      // Missing 'repo' parameter will cause an error
    },
  });
} catch (error) {
  if (error instanceof ComposioToolExecutionError) {
    console.error('Tool execution error:', error.message);
    console.error('Tool:', error.context.toolSlug);
    console.error('Execution params:', error.context.body);
  }
}
```

### Not Found Errors

Errors that occur when a resource is not found:

```typescript
try {
  await composio.tools.get('default', 'NON_EXISTENT_TOOL');
} catch (error) {
  if (error instanceof ComposioToolNotFoundError) {
    console.error('Tool not found:', error.message);
  }
}
```

## Handling Errors in Tool Execution

When executing tools, you should handle both SDK errors and execution result errors:

```typescript
try {
  const result = await composio.tools.execute('GITHUB_GET_REPO', {
    userId: 'default',
    arguments: {
      owner: 'composio',
      repo: 'sdk',
    },
  });
  
  // Check if the execution was successful
  if (result.successful) {
    console.log('Repository details:', result.data);
  } else {
    // Handle unsuccessful execution
    console.error('Execution failed:', result.error);
  }
} catch (error) {
  // Handle SDK errors
  console.error('SDK error:', error.message);
}
```

## Error Handling with Connected Accounts

Handle errors during the connection flow:

```typescript
try {
  // Step 1: Authorize the toolkit
  const connectionRequest = await composio.toolkits.authorize('user123', 'github');
  
  // Step 2: Wait for the connection to be established
  try {
    const connectedAccount = await composio.connectedAccounts.waitForConnection(
      connectionRequest.id,
      60000 // 60 second timeout
    );
    console.log('Connected account:', connectedAccount);
  } catch (timeoutError) {
    if (timeoutError instanceof ConnectionRequestTimeoutError) {
      console.error('Connection timed out. Please try again.');
    } else if (timeoutError instanceof ConnectionRequestFailedError) {
      console.error('Connection failed:', timeoutError.message);
    }
  }
} catch (error) {
  if (error instanceof ComposioAuthConfigNotFoundError) {
    console.error('Auth config not found:', error.message);
  } else {
    console.error('Error initiating connection:', error.message);
  }
}
```

## Global Error Handler

For larger applications, consider implementing a global error handler:

```typescript
// Define a global error handler function
function handleComposioError(error: unknown): void {
  if (error instanceof ValidationError) {
    console.error('Validation error:', error.message);
  } else if (error instanceof ComposioToolNotFoundError) {
    console.error('Tool not found:', error.message);
  } else if (error instanceof ComposioToolExecutionError) {
    console.error('Tool execution error:', error.message);
  } else if (error instanceof ComposioAuthConfigNotFoundError) {
    console.error('Auth config not found:', error.message);
  } else if (error instanceof ConnectionRequestFailedError) {
    console.error('Connection failed:', error.message);
  } else if (error instanceof ConnectionRequestTimeoutError) {
    console.error('Connection timed out:', error.message);
  } else if (error instanceof ComposioError) {
    console.error('Composio error:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}

// Use the global error handler
try {
  const result = await composio.tools.execute('GITHUB_GET_REPO', {
    userId: 'default',
    arguments: {
      owner: 'composio',
      repo: 'sdk',
    },
  });
  
  if (!result.successful) {
    console.error('Execution failed:', result.error);
  }
} catch (error) {
  handleComposioError(error);
}
```

## Error Handling in Custom Tools

When creating custom tools, implement proper error handling in your handler function:

```typescript
const customTool = await composio.tools.createCustomTool({
  name: 'My Custom Tool',
  description: 'A custom tool with error handling',
  slug: 'MY_CUSTOM_TOOL',
  inputParameters: {
    type: 'object',
    properties: {
      param1: { type: 'string' }
    },
    required: ['param1']
  },
  outputParameters: {
    type: 'object',
    properties: {
      result: { type: 'string' }
    }
  },
  handler: async (params, context) => {
    try {
      // Validate input
      const { param1 } = params.arguments;
      if (!param1 || param1.trim() === '') {
        return {
          data: {},
          successful: false,
          error: 'param1 cannot be empty'
        };
      }
      
      // Process the request
      // This could throw various errors
      const result = await someExternalService(param1);
      
      return {
        data: { result },
        successful: true,
        error: null
      };
    } catch (error) {
      // Log the error for debugging
      console.error('Error in custom tool:', error);
      
      // Return a user-friendly error message
      return {
        data: {},
        successful: false,
        error: error.message || 'An unexpected error occurred'
      };
    }
  }
});
```

## Best Practices

1. **Always use try/catch blocks** when calling SDK methods
2. **Check result.successful** after tool execution
3. **Provide specific error handling** for different error types
4. **Log detailed error information** for debugging
5. **Present user-friendly error messages** in your application
6. **Set appropriate timeouts** for operations like waitForConnection
7. **Validate inputs** before calling SDK methods
8. **Implement retry logic** for transient errors