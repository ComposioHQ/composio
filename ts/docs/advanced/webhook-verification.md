# Webhook Verification

Composio sends webhook payloads to notify your application when triggers fire. To ensure these webhooks are authentic and haven't been tampered with, you should verify the webhook signature before processing.

## Overview

The `composio.triggers.verifyWebhook()` method validates incoming webhook requests by:

1. **Verifying the HMAC-SHA256 signature** to ensure the payload is authentic
2. **Checking the timestamp** to prevent replay attacks (optional, enabled by default)
3. **Parsing and normalizing the payload** across different webhook versions

## Webhook Versions

Composio supports three webhook payload versions:

| Version | Status | Description |
|---------|--------|-------------|
| **V3** | Current (Default) | Latest format used by Composio apps. Includes rich metadata with `type: 'composio.trigger.message'` |
| **V2** | Legacy | Older format with nested `data` object containing connection and trigger info |
| **V1** | Legacy | Original format with flat structure using `trigger_name`, `connection_id`, `trigger_id` |

The SDK automatically detects the version and normalizes all payloads to a consistent `IncomingTriggerPayload` format.

## Webhook Headers

Composio webhooks include these headers for verification:

| Header | Description | Example |
|--------|-------------|---------|
| `webhook-id` | Unique message identifier | `msg_abc123` |
| `webhook-timestamp` | Unix timestamp in seconds | `1704067200` |
| `webhook-signature` | HMAC-SHA256 signature | `v1,K7gNU3sdo+OL0wNhqoVWhr3g6s...` |
| `x-composio-webhook-version` | Webhook version (V1, V2, V3) | `V3` |

## API Reference

### `composio.triggers.verifyWebhook(params)`

Verifies an incoming webhook payload and signature.

#### Parameters

```typescript
interface VerifyWebhookParams {
  /** The raw webhook payload as a string (request body) */
  payload: string;
  
  /** The signature from the 'webhook-signature' header */
  signature: string;
  
  /** The webhook secret from your Composio dashboard */
  secret: string;
  
  /** The webhook ID from the 'webhook-id' header */
  id: string;
  
  /** The timestamp from the 'webhook-timestamp' header (Unix seconds) */
  timestamp: string;
  
  /**
   * Maximum allowed age of the webhook in seconds.
   * Set to 0 to disable timestamp validation.
   * @default 300 (5 minutes)
   */
  tolerance?: number;
}
```

#### Return Value

```typescript
interface VerifyWebhookResult {
  /** The detected webhook version (V1, V2, or V3) */
  version: 'V1' | 'V2' | 'V3';
  
  /** The normalized webhook payload */
  payload: IncomingTriggerPayload;
  
  /** The raw parsed payload before normalization */
  rawPayload: WebhookPayloadV1 | WebhookPayloadV2 | WebhookPayloadV3;
}
```

#### Errors

| Error Class | Description |
|-------------|-------------|
| `ValidationError` | Invalid parameters passed to the method |
| `ComposioWebhookSignatureVerificationError` | Signature mismatch, missing headers, or timestamp outside tolerance |
| `ComposioWebhookPayloadError` | Invalid JSON or unrecognized payload format |

## Usage Examples

### Express.js

```typescript
import express from 'express';
import { Composio, ComposioWebhookSignatureVerificationError } from '@composio/core';

const app = express();
const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

// Important: Use express.raw() to get the raw body as a string
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const result = composio.triggers.verifyWebhook({
      payload: req.body.toString(),
      signature: req.headers['webhook-signature'] as string,
      id: req.headers['webhook-id'] as string,
      timestamp: req.headers['webhook-timestamp'] as string,
      secret: process.env.COMPOSIO_WEBHOOK_SECRET!,
    });

    // Process the verified payload
    console.log('Webhook version:', result.version);
    console.log('Trigger:', result.payload.triggerSlug);
    console.log('User ID:', result.payload.userId);
    console.log('Data:', result.payload.payload);

    res.status(200).send('OK');
  } catch (error) {
    if (error instanceof ComposioWebhookSignatureVerificationError) {
      console.error('Webhook verification failed:', error.message);
      res.status(401).send('Unauthorized');
    } else {
      console.error('Webhook processing error:', error);
      res.status(400).send('Bad Request');
    }
  }
});

app.listen(3000);
```

### Next.js API Route (App Router)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { Composio, ComposioWebhookSignatureVerificationError } from '@composio/core';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    
    const result = composio.triggers.verifyWebhook({
      payload,
      signature: request.headers.get('webhook-signature')!,
      id: request.headers.get('webhook-id')!,
      timestamp: request.headers.get('webhook-timestamp')!,
      secret: process.env.COMPOSIO_WEBHOOK_SECRET!,
    });

    // Process the verified payload
    console.log('Received trigger:', result.payload.triggerSlug);
    
    return NextResponse.json({ received: true });
  } catch (error) {
    if (error instanceof ComposioWebhookSignatureVerificationError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }
}
```

### Fastify

```typescript
import Fastify from 'fastify';
import { Composio, ComposioWebhookSignatureVerificationError } from '@composio/core';

const fastify = Fastify();
const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

// Get raw body
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'string' },
  (req, body, done) => done(null, body)
);

fastify.post('/webhook', async (request, reply) => {
  try {
    const result = composio.triggers.verifyWebhook({
      payload: request.body as string,
      signature: request.headers['webhook-signature'] as string,
      id: request.headers['webhook-id'] as string,
      timestamp: request.headers['webhook-timestamp'] as string,
      secret: process.env.COMPOSIO_WEBHOOK_SECRET!,
    });

    console.log('Trigger:', result.payload.triggerSlug);
    return { received: true };
  } catch (error) {
    if (error instanceof ComposioWebhookSignatureVerificationError) {
      reply.code(401);
      return { error: 'Unauthorized' };
    }
    reply.code(400);
    return { error: 'Bad Request' };
  }
});

fastify.listen({ port: 3000 });
```

## Signature Algorithm

The signature is computed as:

```
HMAC-SHA256(${webhookId}.${webhookTimestamp}.${payload}, secret)
```

The result is base64-encoded and prefixed with `v1,`:

```
v1,K7gNU3sdo+OL0wNhqoVWhr3g6s1xYv72ol/pe/Unols=
```

## Timestamp Validation

By default, webhooks older than 5 minutes are rejected to prevent replay attacks. You can customize this behavior:

```typescript
// Strict: 1 minute tolerance
const result = composio.triggers.verifyWebhook({
  ...params,
  tolerance: 60,
});

// Lenient: 10 minute tolerance
const result = composio.triggers.verifyWebhook({
  ...params,
  tolerance: 600,
});

// Disable timestamp validation (not recommended for production)
const result = composio.triggers.verifyWebhook({
  ...params,
  tolerance: 0,
});
```

## Payload Structures

### V3 Payload (Current Default)

```json
{
  "id": "msg_abc123",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "type": "composio.trigger.message",
  "metadata": {
    "log_id": "log-123",
    "trigger_slug": "GITHUB_PUSH_EVENT",
    "trigger_id": "trigger-nano-123",
    "connected_account_id": "conn-nano-123",
    "auth_config_id": "auth-nano-123",
    "user_id": "user-456"
  },
  "data": {
    "action": "push",
    "repository": "my-repo"
  }
}
```

### V2 Payload (Legacy)

```json
{
  "type": "github_push_event",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "log_id": "log-123",
  "data": {
    "connection_id": "conn-123",
    "connection_nano_id": "conn-nano-123",
    "trigger_nano_id": "trigger-nano-123",
    "trigger_id": "trigger-123",
    "user_id": "user-456",
    "action": "push",
    "repository": "my-repo"
  }
}
```

### V1 Payload (Legacy)

```json
{
  "trigger_name": "GITHUB_PUSH_EVENT",
  "connection_id": "conn-123",
  "trigger_id": "trigger-123",
  "payload": {
    "action": "push",
    "repository": "my-repo"
  },
  "log_id": "log-123"
}
```

## Normalized Payload

Regardless of webhook version, the `payload` field in the result is normalized to:

```typescript
interface IncomingTriggerPayload {
  id: string;
  uuid: string;
  triggerSlug: string;
  toolkitSlug: string;
  userId: string;
  payload: Record<string, unknown>;
  originalPayload: Record<string, unknown>;
  metadata: {
    id: string;
    uuid: string;
    toolkitSlug: string;
    triggerSlug: string;
    triggerConfig: Record<string, unknown>;
    connectedAccount: {
      id: string;
      uuid: string;
      authConfigId: string;
      authConfigUUID: string;
      userId: string;
      status: string;
    };
  };
}
```

## Security Best Practices

1. **Always verify webhooks** before processing them in production
2. **Store your webhook secret securely** using environment variables
3. **Use HTTPS** for your webhook endpoint
4. **Keep timestamp tolerance reasonable** (default 5 minutes is recommended)
5. **Parse the raw body** - don't use pre-parsed JSON as middleware may modify it
6. **Handle errors gracefully** - return 401 for signature failures, 400 for parsing errors
7. **Log verification failures** for security monitoring

## Finding Your Webhook Secret

Your webhook secret is available in the [Composio Dashboard](https://app.composio.dev) under your project settings. Keep this secret secure and never expose it in client-side code.
