# Telemetry in Composio SDK

Composio SDK includes a telemetry system to help improve the SDK and provide insights into usage patterns. This guide explains how telemetry works, what data is collected, how to customize it, and how to disable it if needed.

## Overview

The telemetry system in Composio SDK is:

- **Opt-out**: Enabled by default but can be disabled
- **Privacy-focused**: Does not collect personal or sensitive information
- **Transparent**: Clear about what data is collected
- **Configurable**: Custom transports can be provided

## Telemetry Data

The telemetry system collects the following types of data:

- **SDK Usage**: API calls, method invocations, error counts
- **Performance Metrics**: Response times, success/failure rates
- **Environment Information**: SDK version, provider used, runtime context

No personal or sensitive information such as:

- API keys
- Tool arguments
- Tool responses
- User IDs
- Connected account details

## Disabling Telemetry

You can disable telemetry when initializing the SDK:

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: 'your-api-key',
  allowTracking: false, // Disable telemetry
});
```

Or by setting an environment variable:

```bash
# In your .env file or environment
COMPOSIO_DISABLE_TELEMETRY=true
```

## Custom Telemetry Transport

For advanced use cases, you can provide a custom telemetry transport to process the telemetry data according to your needs:

```typescript
import { Composio, BaseTelemetryTransport, TelemetryEvent } from '@composio/core';

// Create a custom telemetry transport
class CustomTelemetryTransport extends BaseTelemetryTransport {
  async send(event: TelemetryEvent): Promise<void> {
    // Process the telemetry event
    console.log(`Telemetry event: ${event.name}`, event.properties);

    // You can send it to your own analytics system
    await yourAnalyticsSystem.track(event.name, event.properties);
  }

  async flush(): Promise<void> {
    // Clean up any pending events
    await yourAnalyticsSystem.flush();
  }
}

// Use the custom transport
const composio = new Composio({
  apiKey: 'your-api-key',
  telemetryTransport: new CustomTelemetryTransport(),
});
```

## Implementing a Custom Transport

To implement a custom telemetry transport, extend the `BaseTelemetryTransport` class:

```typescript
import { BaseTelemetryTransport, TelemetryEvent } from '@composio/core';

export class CustomTelemetryTransport extends BaseTelemetryTransport {
  // Optional constructor for configuration
  constructor(private config: { endpoint: string; batchSize: number }) {
    super();
    this.events = [];
  }

  // Local state for batching events
  private events: TelemetryEvent[];

  // Required: Implement the send method
  async send(event: TelemetryEvent): Promise<void> {
    // Add the event to the batch
    this.events.push(event);

    // If batch is full, flush it
    if (this.events.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  // Required: Implement the flush method
  async flush(): Promise<void> {
    if (this.events.length === 0) {
      return;
    }

    try {
      // Send the batch to your endpoint
      await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          events: this.events,
          timestamp: new Date().toISOString(),
        }),
      });

      // Clear the batch
      this.events = [];
    } catch (error) {
      console.error('Failed to send telemetry:', error);
    }
  }
}
```

## Telemetry Events

The telemetry system instruments various parts of the SDK and emits events for different operations:

### SDK Initialization

```
event: "sdk_initialized"
properties:
  framework: string      // The provider name
  isAgentic: boolean     // Whether the provider is agentic
  source: string         // The runtime environment ("node" or "browser")
  version: string        // The SDK version
  isBrowser: boolean     // Whether the SDK is running in a browser
```

### Tool Operations

```
event: "tools_get"
properties:
  toolkit_slugs: string[]  // The toolkit slugs used in the filter
  tool_count: number       // The number of tools returned
  provider: string         // The provider name

event: "tool_execute"
properties:
  tool_slug: string        // The slug of the executed tool
  toolkit_slug: string     // The toolkit slug of the executed tool
  success: boolean         // Whether the execution was successful
  duration_ms: number      // The execution duration in milliseconds
  provider: string         // The provider name
```

### Connected Account Operations

```
event: "connected_account_initiate"
properties:
  toolkit_slug: string     // The toolkit slug
  auth_config_id: string   // The auth config ID

event: "connected_account_get"
properties:
  success: boolean         // Whether the operation was successful

event: "connected_account_list"
properties:
  count: number            // The number of connected accounts returned
  success: boolean         // Whether the operation was successful
```

### Toolkit Operations

```
event: "toolkit_get"
properties:
  success: boolean         // Whether the operation was successful
  toolkit_slug: string     // The toolkit slug (if getting a specific toolkit)
  toolkits_count: number   // The number of toolkits returned (if getting multiple)
```

## Telemetry Processor

The SDK includes a batch processor for telemetry events that:

1. Buffers events to reduce API calls
2. Sends events in batches
3. Handles retries and failures
4. Automatically flushes at regular intervals
5. **Automatically flushes on process exit** (Node.js-compatible environments only) - handles `beforeExit`, `SIGINT`, and `SIGTERM` signals

This ensures that telemetry doesn't impact application performance and that all telemetry is sent before the process exits.

> **Note:** On Node.js-compatible environments, the SDK automatically registers exit handlers to ensure all pending telemetry is sent.

### Cloudflare Workers and Edge Runtimes

In environments like Cloudflare Workers that don't support `process.on('beforeExit')`, you should manually flush telemetry using `ctx.waitUntil()`:

```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const composio = new Composio({ apiKey: env.COMPOSIO_API_KEY });

    // Do your work...
    const result = await composio.tools.execute(...);

    // Ensure telemetry flushes before worker terminates
    ctx.waitUntil(composio.flush());

    return new Response(JSON.stringify(result));
  }
};
```

## Environment Context

The telemetry system automatically includes environment context with each event:

```typescript
interface TelemetryMetadata {
  apiKey: string; // The Composio API key (first 8 chars only, for identification)
  baseUrl: string; // The Composio API base URL
  framework: string; // The provider name
  isAgentic: boolean; // Whether the provider is agentic
  source: string; // The runtime environment
  version: string; // The SDK version
  isBrowser: boolean; // Whether the SDK is running in a browser
}
```

## Browser vs Node.js

The SDK automatically detects whether it's running in a browser or Node.js environment and uses the appropriate transport mechanism:

- In Node.js: Uses ProcessTransport with HTTP requests
- In Browser: Uses BrowserTransport with more browser-friendly approaches

## Best Practices

1. **Leave telemetry enabled** if possible to help improve the SDK
2. If you need to **disable telemetry** for compliance reasons, use the `allowTracking: false` option
3. If you want to **process telemetry locally**, implement a custom transport
4. **Never log sensitive data** in your custom transports
5. If you **implement a custom provider**, set a meaningful name to improve telemetry insights
