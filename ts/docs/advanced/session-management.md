# Session Management

The Composio SDK provides powerful session management capabilities through the `createSession` method. This feature allows you to create new instances of the SDK with custom request options while preserving your existing configuration. This is particularly useful when you need to add request-specific headers, track request contexts, or customize request behavior for specific operations.

## Composio Constructor Options

When initializing the SDK, you can provide the following options:

```typescript
const composio = new Composio({
  apiKey: 'your-api-key', // required
  baseURL: 'https://api.composio.dev', // optional
  allowTracking: true, // optional, default: true
  allowTracing: true, // optional, default: true
  provider: new OpenAIProvider(), // optional
  telemetryTransport: customTransport, // optional
  defaultHeaders: { 'x-request-id': 'global-id' }, // optional, applies to all requests
});
```

- `apiKey` (**required**): Your Composio API key
- `baseURL` (optional): Custom API endpoint
- `allowTracking` (optional, default: true): Enable/disable telemetry
- `allowTracing` (optional, default: true): Enable/disable tracing
- `provider` (optional): Custom provider (defaults to OpenAIProvider)
- `telemetryTransport` (optional): Custom telemetry transport
- `defaultHeaders` (optional): Default headers for all requests (applies globally)

## Overview

When you create a new session using `createSession`, you get a new Composio instance that:

- Inherits all configuration from the parent instance (apiKey, baseURL, provider, etc.)
- Allows you to specify custom request headers that will be applied to all API calls made through that session
- Maintains isolation between different sessions, enabling parallel operations with different contexts

## Use Cases

Sessions are particularly useful for:

1. **Request Tracking**

   - Adding correlation IDs
   - Including request IDs for tracing
   - Setting custom headers for monitoring

2. **Context Management**

   - Managing user-specific contexts
   - Handling different authentication contexts
   - Implementing tenant-specific headers

3. **Request Customization**
   - Modifying request behavior for specific operations
   - Adding custom metadata
   - Implementing custom retry logic

## Usage

Here's how to use session management in your application:

```typescript
// Create your base Composio instance
const composio = new Composio({
  apiKey: 'your-api-key',
});

// Create a session with custom headers
const sessionWithHeaders = composio.createSession({
  headers: {
    'x-request-id': '1234567890',
    'x-correlation-id': 'session-abc-123',
    'x-custom-header': 'custom-value',
  },
});

// Use the session for making API calls
await sessionWithHeaders.tools.list();
```

## Advanced Usage

You can create multiple sessions with different configurations:

```typescript
// Session for user A
const userASession = composio.createSession({
  headers: {
    'x-user-id': 'user-a',
    'x-tenant-id': 'tenant-1',
  },
});

// Session for user B
const userBSession = composio.createSession({
  headers: {
    'x-user-id': 'user-b',
    'x-tenant-id': 'tenant-2',
  },
});

// Each session maintains its own context
await Promise.all([
  userASession.tools.get('a'), // Will include user A's headers
  userBSession.tools.list('b'), // Will include user B's headers
]);
```

## Best Practices

1. **Session Lifecycle**

   - Create sessions for specific contexts or operations
   - Don't share sessions across different contexts
   - Create new sessions when context changes

2. **Header Management**

   - Use consistent header naming conventions
   - Include relevant tracking IDs
   - Document custom headers used in your application

3. **Error Handling**
   - Sessions inherit error handling from the parent instance
   - Add context-specific error handling when needed

## Request Options

The session accepts custom headers via the `headers` property. These headers will be used for all API calls made through that session:

```typescript
const session = composio.createSession({
  headers: {
    // Custom headers
    'x-request-id': 'unique-id',
    'x-correlation-id': 'correlation-id',
    'content-type': 'application/json',
  },
});
```

If you want to set default headers for all requests (even outside sessions), use the `defaultHeaders` property in the main constructor:

```typescript
const composio = new Composio({
  apiKey: 'your-api-key',
  defaultHeaders: {
    'x-global-header': 'global-value',
  },
});
```

## Limitations and Considerations

1. Sessions are immutable – once created, their configuration (including headers) cannot be changed.
2. Each session is a new Composio instance with its own context and headers.
3. Headers set in a session apply to all API calls made through that session.

## Related Topics

- [Error Handling](./error-handling.md)
- [Custom Providers](./custom-providers.md)
- [Telemetry](./telemetry.md)
