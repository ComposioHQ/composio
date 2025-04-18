# Telemetry Transports

This directory contains implementations of different telemetry transport mechanisms for sending telemetry data to various endpoints.

## Available Transports

- `BrowserTransport`: Uses XMLHttpRequest for browser environments
- `ProcessTransport`: Uses Node.js child processes for server-side environments
- `ConsoleTransport`: Logs telemetry data to console (for development/debugging)

## Using with Composio

To use a custom telemetry transport with the Composio instance:

```typescript
import { Composio, BaseTelemetryTransport } from '@composio/core';

// Create your custom transport
class CustomTelemetryTransport implements BaseTelemetryTransport {
    async send(payload: TelemetryTransportParams): Promise<void> {
        // Your custom implementation
        console.log('Sending telemetry:', payload);
        return Promise.resolve();
    }
}

// Initialize Composio with your custom transport
const composio = new Composio({
    apiKey: 'your-api-key',
    baseURL: 'https://api.composio.dev',
    allowTracking: true, // Enable telemetry
    telemetryTransport: new CustomTelemetryTransport() // Pass your custom transport
});
```

You can also use the built-in transports:

```typescript
import { Composio, BrowserTelemetryTransport, ProcessTelemetryTransport } from '@composio/core';

// For browser environments
const composio = new Composio({
    apiKey: 'your-api-key',
    telemetryTransport: new BrowserTelemetryTransport()
});

// For Node.js environments
const composio = new Composio({
    apiKey: 'your-api-key',
    telemetryTransport: new ProcessTelemetryTransport()
});
```

Note: The telemetry system will automatically use the appropriate transport based on the environment if you don't specify one, but you can override this behavior by providing your own transport.

## Creating a New Transport

To create a new telemetry transport, follow these steps:

1. Create a new file in the `transports` directory (e.g., `YourNewTransport.ts`)

2. Implement the `BaseTelemetryTransport` interface:

```typescript
import { TelemetryTransportParams } from "../../types/telemetry.types";
import { BaseTelemetryTransport } from "../TelemetryTransport";

export class YourNewTransport implements BaseTelemetryTransport {
    send(payload: TelemetryTransportParams): Promise<void> {
        return new Promise((resolve) => {
            try {
                // Your transport-specific implementation
                // e.g., using fetch, WebSocket, or any other transport mechanism
                
                // Always resolve the promise, even on error
                resolve();
            } catch (error) {
                // Handle errors silently
                resolve();
            }
        });
    }
}
```

### Required Interface

Your transport must implement the following interface:

```typescript
interface TelemetryTransportParams {
    url: string;           // The endpoint to send data to
    method: string;        // HTTP method (e.g., 'POST')
    headers: Record<string, string>;  // HTTP headers
    data: AcceptableJSONValue;  // The actual telemetry data
}
```

### Implementation Guidelines

1. **Error Handling**
   - Always resolve the promise, even when errors occur
   - Don't throw errors that could affect the main application flow
   - Log errors appropriately for debugging

2. **Environment Awareness**
   - Add environment-specific checks if your transport is meant for a specific runtime
   - Example:
   ```typescript
   if (typeof window === 'undefined') {
       return Promise.reject(new Error('YourTransport can only be used in specific environment'));
   }
   ```

3. **Performance**
   - Keep the implementation lightweight
   - Ensure non-blocking operation
   - Consider using background processes or workers for heavy operations

### Example: WebSocket Transport

Here's an example of a WebSocket-based transport:

```typescript
export class WebSocketTransport implements BaseTelemetryTransport {
    private ws: WebSocket | null = null;
    private queue: TelemetryTransportParams[] = [];
    private isConnecting = false;

    constructor(private url: string) {}

    private async connect(): Promise<void> {
        if (this.isConnecting) return;
        this.isConnecting = true;

        return new Promise((resolve) => {
            this.ws = new WebSocket(this.url);
            
            this.ws.onopen = () => {
                this.isConnecting = false;
                this.processQueue();
                resolve();
            };

            this.ws.onerror = () => {
                this.isConnecting = false;
                resolve();
            };
        });
    }

    private async processQueue() {
        while (this.queue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
            const payload = this.queue.shift();
            if (payload) {
                this.ws.send(JSON.stringify(payload));
            }
        }
    }

    async send(payload: TelemetryTransportParams): Promise<void> {
        return new Promise((resolve) => {
            try {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                    this.queue.push(payload);
                    this.connect().then(resolve);
                } else {
                    this.ws.send(JSON.stringify(payload));
                    resolve();
                }
            } catch (error) {
                resolve();
            }
        });
    }
}
```

### Integration

To use your new transport:

```typescript
import { YourNewTransport } from './transports/YourNewTransport';

// Create an instance
const transport = new YourNewTransport();

// Use with telemetry system
telemetrySystem.setTransport(transport);
```

## Best Practices

1. **Testing**
   - Write unit tests for your transport
   - Test error scenarios
   - Verify environment-specific behavior

2. **Documentation**
   - Document any specific requirements or dependencies
   - Include usage examples
   - Note any environment limitations

3. **Maintenance**
   - Keep dependencies up to date
   - Monitor for deprecation warnings
   - Update documentation as needed
