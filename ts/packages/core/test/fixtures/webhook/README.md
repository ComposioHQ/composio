# Webhook Verification Test Fixtures

This directory contains sanitized webhook fixtures for testing the `verifyWebhook` function.
These fixtures use deterministic test secrets so the tests can verify both the structure
and the signature verification algorithm.

## Fixture Format

Each fixture file contains:

```json
{
  "description": "Human-readable description of this fixture",
  "capturedAt": "ISO 8601 timestamp when this was captured",
  "headers": {
    "webhook-id": "msg_xxx",
    "webhook-timestamp": "1234567890",
    "webhook-signature": "v1,base64_signature"
  },
  "payload": "{...raw JSON payload string...}",
  "testSecret": "deterministic-test-secret",
  "expectedResult": {
    "version": "V1|V2|V3",
    "triggerSlug": "GITHUB_PUSH_EVENT"
  }
}
```

## Why Sanitized Fixtures?

Real webhook secrets should **never** be committed to version control. Instead:

1. We capture real webhooks to preserve exact JSON structure and whitespace
2. Replace sensitive IDs with sanitized placeholders (e.g., `msg_SANITIZED_001`)
3. Re-sign the payload with a known test secret
4. The test validates both structure correctness and algorithm correctness

## How to Capture New Fixtures

### 1. Start the Webhook Server

```bash
cd ts/examples/triggers
pnpm webhook
```

### 2. Expose Locally with ngrok or telebit

```bash
ngrok http 3000
# OR
telebit http 3000
```

### 3. Configure Webhook URL in Composio Dashboard

Set the webhook URL to your public URL (e.g., `https://abc123.ngrok.io/webhook`).

### 4. Trigger an Event

Perform an action that triggers the webhook (e.g., push to a GitHub repo).

### 5. Capture the Raw Request

The webhook server logs the raw headers and payload. Copy them.

### 6. Sanitize and Re-sign

Use this script to create a sanitized fixture:

```typescript
import * as crypto from 'node:crypto';

const testSecret = 'test-webhook-secret-for-fixtures';

// Your captured data (sanitize IDs first!)
const webhookId = 'msg_SANITIZED_001';
const webhookTimestamp = '1738150200';
const payload = '{"id":"evt-SANITIZED",...}';

// Compute new signature with test secret
const toSign = `${webhookId}.${webhookTimestamp}.${payload}`;
const signature = crypto.createHmac('sha256', testSecret).update(toSign, 'utf8').digest('base64');

console.log(`v1,${signature}`);
```

### 7. Create the Fixture File

Save as `v3-<description>.json` (or v1/v2 depending on version).

## Golden Signatures

The `golden-signatures.json` file contains contract test cases that verify
the signature algorithm produces consistent output. These should never change
unless the algorithm itself changes.

## Testing

The fixtures are loaded by `verifyWebhook.integration.test.ts` and used to:

1. Verify signature validation works with real-world payload structure
2. Test version detection (V1, V2, V3)
3. Ensure payload normalization produces expected output
4. Contract test that algorithm hasn't changed (golden signatures)
