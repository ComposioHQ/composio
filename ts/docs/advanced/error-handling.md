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
import { z } from 'zod';

const customTool = await composio.tools.createCustomTool({
  name: 'My Custom Tool',
  description: 'A custom tool with error handling',
  slug: 'MY_CUSTOM_TOOL',
  inputParams: z.object({
    param1: z.string().describe('Required parameter')
  }),
  execute: async (input) => {
    try {
      // Input is already validated by zod
      const { param1 } = input;
      if (!param1 || param1.trim() === '') {
        return {
          data: {},
          successful: false,
          error: 'param1 cannot be empty',
        };
      }

      // Process the request
      // This could throw various errors
      const result = await someExternalService(param1);

      return {
        data: { result },
        successful: true,
        error: null,
      };
    } catch (error) {
      // Log the error for debugging
      console.error('Error in custom tool:', error);

      // Return a user-friendly error message
      return {
        data: {},
        successful: false,
        error: error.message || 'An unexpected error occurred',
      };
    }
  },
});
```

## User-Friendly Error Display

Composio SDK provides features to display errors in a more user-friendly way with colors and formatting:

### Using toString()

The `toString()` method on `ComposioError` and its subclasses provides a formatted string representation of the error:

```typescript
try {
  // Some operation that might fail
} catch (error) {
  if (error instanceof ComposioError) {
    // This will output a nicely formatted error message with color
    console.error(error.toString());
  }
}
```

### Using prettyPrint()

The `prettyPrint()` method provides an even more visually appealing error display:

```typescript
try {
  // Some operation that might fail
} catch (error) {
  if (error instanceof ComposioError) {
    // This will print a beautifully formatted error with color directly to console.error
    error.prettyPrint();

    // You can include the stack trace by passing true
    error.prettyPrint(true);

    // Important: Don't re-throw the error or log it again after pretty printing
    // to avoid duplicate error messages
  }
}
```

> **Note:** When using `prettyPrint()`, avoid logging the error again or re-throwing it without handling, as this would result in duplicate error messages in the console.

### Using the handle Utility

For a more consistent approach to error handling, use the static `handle` method:

```typescript
try {
  // Some operation that might fail
} catch (error) {
  // This handles all types of errors with proper formatting
  ComposioError.handle(error);

  // Include stack trace
  ComposioError.handle(error, { includeStack: true });
}
```

This method:

- Automatically detects Composio errors and uses `prettyPrint` for them
- Formats standard errors with a similar style
- Handles unknown errors gracefully

### Using handleAndThrow for Fatal Errors

For fatal errors that should stop execution, use the `handleAndThrow` method which displays the error and then throws it:

```typescript
try {
  // Some operation that might fail
} catch (error) {
  // Display the error and then throw it (for fatal errors)
  ComposioError.handleAndThrow(error);

  // Include stack trace before throwing
  ComposioError.handleAndThrow(error, true);
}
```

This method:

- Displays the error using the same formatting as `handle()`
- Always throws the error after displaying it
- Returns `never` type, indicating it always throws
- Is compatible with serverless environments (unlike `process.exit()`)

### Creating and Printing Errors

You can use the static factory method to create and print errors in one step:

```typescript
// Create, print, and throw the error
throw ComposioError.createAndPrint('Something went wrong', {
  code: 'CUSTOM_ERROR',
  cause: 'The operation failed because of XYZ',
  possibleFixes: ['Try solution A', 'Try solution B'],
});
```

This approach is particularly useful for creating custom error handlers or formatters.

## Best Practices

1. **Always use try/catch blocks** when calling SDK methods
2. **Check result.successful** after tool execution
3. **Provide specific error handling** for different error types
4. **Log detailed error information** for debugging
5. **Present user-friendly error messages** in your application
6. **Set appropriate timeouts** for operations like waitForConnection
7. **Validate inputs** before calling SDK methods
8. **Implement retry logic** for transient errors

## Importing Error Classes

All error classes are exported from the main SDK package, making them easy to import:

```typescript
import {
  ComposioError,
  ComposioNoAPIKeyError,
  ComposioToolNotFoundError,
  ValidationError,
} from '@composio/core';
```

You can also use the error handling utilities in your application:

```typescript
import { ComposioError } from '@composio/core';

// Centralized error handler
function handleApplicationError(error: unknown) {
  // Use the built-in error handling utility
  ComposioError.handle(error, {
    includeStack: process.env.NODE_ENV === 'development',
  });

  // Add your custom application-specific error handling
  // e.g., log to monitoring service, etc.
}

// Use in try/catch blocks
try {
  // Application code
} catch (error) {
  handleApplicationError(error);
}
```

If you want to create custom error types that extend the Composio error system:

```typescript
import { ComposioError } from '@composio/core';

class MyCustomError extends ComposioError {
  constructor(message: string) {
    super(message, {
      code: 'MY_CUSTOM_ERROR',
      possibleFixes: [
        'Check your application configuration',
        'Ensure all required dependencies are installed',
      ],
    });
    this.name = 'MyCustomError';
  }
}

// Use your custom error
try {
  // Some condition
  if (!config.isValid) {
    throw new MyCustomError('Invalid configuration');
  }
} catch (error) {
  ComposioError.handle(error);
}
```
