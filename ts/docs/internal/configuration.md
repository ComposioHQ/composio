# Configuration

This guide explains how to configure the Composio SDK using environment variables and initialization options.

## Environment Variables

The SDK supports several environment variables for configuration:

### Core Configuration

- `COMPOSIO_API_KEY`: Your Composio API key

  - Required for authentication
  - Can be obtained from [Composio Dashboard](https://app.composio.dev)
  - Can also be set via SDK initialization or user config file

- `COMPOSIO_BASE_URL`: Custom API base URL
  - Optional
  - Default: `https://backend.composio.dev`
  - Use this to point the SDK to a different API endpoint

### Logging Configuration

- `COMPOSIO_LOG_LEVEL`: Controls the verbosity of SDK logs
  - Values: `silent`, `error`, `warn`, `info`, `debug`
  - Default: `info`
  - Hierarchy (from highest to lowest priority):
    - `silent`: No logs
    - `error`: Only critical errors
    - `warn`: Warnings and errors
    - `info`: General information, warnings, and errors
    - `debug`: Detailed debugging information

### Development and Testing

- `NODE_ENV`: Environment mode

  - Values: `development`, `production`, `test`
  - Affects:
    - Telemetry collection (disabled in development/test)
    - Error handling verbosity
    - Version check notifications

- `DEVELOPMENT`: Development mode flag

  - Set to any value to enable development mode
  - Enables additional debugging features
  - Shows more verbose logs

- `CI`: CI environment flag
  - Set to any value to indicate CI environment
  - Affects certain behaviors like version checks

### Telemetry

- `COMPOSIO_DISABLE_TELEMETRY`: Disable telemetry collection
  - Set to `"true"` to disable
  - Default: `"false"`
  - Alternative to `allowTracking` initialization option

## SDK Initialization Options

When initializing the SDK, you can provide configuration through the constructor:

```typescript
const composio = new Composio({
  apiKey: 'your-api-key', // Override COMPOSIO_API_KEY
  baseURL: 'custom-url', // Override COMPOSIO_BASE_URL
  allowTracking: false, // Disable telemetry
  allowTracing: true, // Enable tracing
  provider: new CustomProvider(), // Custom provider
  telemetryTransport: customTransport, // Custom telemetry transport
});
```

### Configuration Priority

When multiple configuration sources are present, the SDK follows this priority order:

1. Constructor parameters
2. Environment variables
3. User config file
4. Default values

## Examples

### Development Setup

```bash
# Development environment with debug logging
export NODE_ENV=development
export COMPOSIO_LOG_LEVEL=debug
export COMPOSIO_API_KEY=your-api-key
```

### Production Setup

```bash
# Production environment with minimal logging
export NODE_ENV=production
export COMPOSIO_LOG_LEVEL=error
export COMPOSIO_API_KEY=your-api-key
```

### Testing Setup

```bash
# Test environment with telemetry disabled
export NODE_ENV=test
export COMPOSIO_DISABLE_TELEMETRY=true
export COMPOSIO_API_KEY=your-test-api-key
```

## Best Practices

1. **Environment-specific Configuration**

   - Use different log levels for different environments
   - Enable detailed logging in development
   - Use minimal logging in production

2. **Security**

   - Never commit API keys to version control
   - Use environment variables or secure secrets management
   - Consider using different API keys for different environments

3. **Telemetry**

   - Enable telemetry in production for better support
   - Disable telemetry in development and testing
   - Use custom telemetry transport for specific needs

4. **Error Handling**
   - Set appropriate log levels for error tracking
   - Use debug level during development
   - Use error or warn level in production
