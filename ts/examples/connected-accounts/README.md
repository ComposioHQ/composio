# Connected Accounts Example

This example demonstrates how to work with connected accounts in the Composio SDK, including authorization flows and waiting for connections to become active.

## Overview

Connected accounts in Composio enable your application to interact with third-party services on behalf of your users. This example showcases:

1. Creating connection requests
2. Directing users to authorization pages
3. Waiting for connections to become active
4. Using connected accounts with tools

## Example Files

- **toolkit-authorize.ts**: Demonstrates authorizing a toolkit and waiting for the connection
- **magic-flow-demo.ts**: Shows how to use the magic flow for a streamlined connection experience
- **index.ts**: Basic entry point that imports the examples

## Using the waitForConnection Method

The `waitForConnection` method is a crucial part of the connection flow. It allows your application to:

- Poll the Composio API until a connection becomes active
- Handle connection failures gracefully
- Set appropriate timeouts for your use case

### Syntax

```typescript
// From a ConnectionRequest object
await connectionRequest.waitForConnection(timeout?: number): Promise<ConnectedAccountRetrieveResponse>

// From the ConnectedAccounts class
await composio.connectedAccounts.waitForConnection(
  connectedAccountId: string,
  timeout?: number
): Promise<ConnectedAccountRetrieveResponse>
```

### Example Usage

```typescript
// Create a connection request
const connectionRequest = await composio.toolkits.authorize('default', 'github');

// If there's a redirect URL, show it to the user
if (connectionRequest.redirectUrl) {
  console.log(`Please visit: ${connectionRequest.redirectUrl}`);
}

// Wait for the connection to be established (with default 60s timeout)
try {
  const connectedAccount = await connectionRequest.waitForConnection();
  console.log(`Connection successful! ID: ${connectedAccount.id}`);
} catch (error) {
  if (error instanceof ConnectionRequestTimeoutError) {
    console.error('Connection timed out. Please try again.');
  } else if (error instanceof ConnectionRequestFailedError) {
    console.error(`Connection failed: ${error.message}`);
  }
}
```

### With Custom Timeout

```typescript
// Wait for up to 3 minutes
const connectedAccount = await connectionRequest.waitForConnection(180000);
```

### Handling Connection States

The `waitForConnection` method handles different connection states:

- `ACTIVE`: Returns the connected account
- `FAILED`, `EXPIRED`, `DELETED`: Throws a `ConnectionRequestFailedError`
- Timeout exceeded: Throws a `ConnectionRequestTimeoutError`

## Running This Example

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Set your API key:

   ```bash
   export COMPOSIO_API_KEY=your_api_key
   ```

3. Run the example:
   ```bash
   pnpm start
   ```
