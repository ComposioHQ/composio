# Error Class Consistency in Composio SDK

This document outlines the standardized pattern for error classes in the Composio SDK.

## Standardized Error Class Pattern

All error classes in the Composio SDK follow this standard pattern:

```typescript
export class SomeSpecificError extends ComposioError {
  constructor(
    message: string = 'Default error message',
    options: Omit<ComposioErrorOptions, 'code'> = {}
  ) {
    super(message, {
      ...options,
      code: ERROR_CODE_CONSTANT,
      possibleFixes: options.possibleFixes || [
        'Default fix suggestion 1',
        'Default fix suggestion 2',
      ],
    });
    this.name = 'SomeSpecificError';
  }
}
```

## Key Standardization Points

1. **Message Parameter**: All constructors accept a message string with a default value.
2. **Options Object**: All constructors take an options object (rather than individual properties).
3. **Default Values**: Default values are provided for both the message and options parameters.
4. **Preserving Options**: All options are preserved with `...options` and only specific properties are overridden.
5. **Default Fixes**: Default `possibleFixes` are provided but can be overridden.
6. **Name Property**: Each error class sets its `name` property to match the class name.

## Special Cases

Some error classes have specific requirements:

1. **ValidationError**: Accepts a `zodError` in the options.

   ```typescript
   new ValidationError('Message', { zodError: someZodError });
   ```

2. **ComposioToolExecutionError**: Accepts an `originalError` in the options.
   ```typescript
   new ComposioToolExecutionError('Message', { originalError: someError });
   ```

## Using Error Classes

```typescript
// Basic usage
throw new ComposioNoAPIKeyError();

// With custom message
throw new ComposioToolNotFoundError('Could not find the specified tool');

// With additional options
throw new ComposioConnectedAccountNotFoundError('Account not found', {
  meta: {
    accountId: '12345',
    userId: 'user123',
  },
});

// Special cases
try {
  // Some code that might throw
} catch (error) {
  // Handle tool execution errors
  throw new ComposioToolExecutionError('Tool failed', {
    originalError: error,
    meta: { toolId: 'some-tool' },
  });

  // Handle validation errors
  throw new ValidationError('Validation failed', {
    zodError: someZodError,
  });
}
```

## Utility Methods

All error classes inherit these helpful methods from `ComposioError`:

1. **toString()**: Returns a formatted string representation
2. **prettyPrint()**: Prints a formatted error message to the console
3. **toJSON()**: Returns a JSON representation of the error

## Static Factory Methods

1. **ComposioError.createAndPrint()**: Creates and prints an error in one step
2. **ComposioError.handle()**: Generic error handler for any error type
