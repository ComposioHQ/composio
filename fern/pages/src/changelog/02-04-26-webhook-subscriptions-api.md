# Webhook Subscriptions API

A new API for managing webhook configurations with event filtering, HMAC signature verification, and support for platform lifecycle events. This replaces the legacy project-level webhook settings with a more flexible, subscription-based model.

## Summary

| Change | Type | Action Required |
|--------|------|-----------------|
| New Webhook Subscriptions API | New Feature | No |
| `composio.connected_account.expired` event | New Feature | Opt-in |
| Legacy webhook endpoints | Deprecated | Migration recommended |
| `webhook_url`, `webhook_secret` in Project | Deprecated | Use new API |

## New Features

### Webhook Subscriptions API

A dedicated API for creating and managing webhook endpoints with granular event filtering.

**Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v3/webhook_subscriptions` | List all subscriptions |
| `POST` | `/api/v3/webhook_subscriptions` | Create a subscription |
| `GET` | `/api/v3/webhook_subscriptions/{id}` | Get subscription details |
| `PATCH` | `/api/v3/webhook_subscriptions/{id}` | Update subscription |
| `DELETE` | `/api/v3/webhook_subscriptions/{id}` | Delete subscription |
| `POST` | `/api/v3/webhook_subscriptions/{id}/rotate_secret` | Rotate signing secret |
| `GET` | `/api/v3/webhook_subscriptions/event_types` | List available event types |

**Key capabilities:**

- **Event filtering**: Subscribe only to events you need
- **HMAC signatures**: Every webhook includes a cryptographic signature for verification
- **Secret rotation**: Rotate signing secrets without downtime
- **Version control**: Choose payload format version (V1, V2, V3)

### Creating a Subscription

```bash
curl -X POST "https://backend.composio.dev/api/v3/webhook_subscriptions" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://your-server.com/webhooks/composio",
    "enabled_events": ["composio.trigger.message"],
    "version": "V3"
  }'
```

**Response:**

```json
{
  "id": "whs_abc123xyz",
  "webhook_url": "https://your-server.com/webhooks/composio",
  "version": "V3",
  "enabled_events": ["composio.trigger.message"],
  "secret": "whsec_a1b2c3d4e5f6...",
  "created_at": "2026-02-04T12:00:00.000Z",
  "updated_at": "2026-02-04T12:00:00.000Z"
}
```

<Warning>
The `secret` is only returned once at creation time. Store it securely for signature verification.
</Warning>

### New Event: `composio.connected_account.expired`

A new platform event that notifies you when a connected account's authentication expires and cannot be automatically refreshed.

**Supported versions:** V3 only

**Use cases:**
- Prompt users to re-authenticate before workflows fail
- Track connection health across your user base
- Automate re-connection flows

**Payload structure:**

```json
{
  "id": "msg_abc123",
  "timestamp": "2026-02-04T12:00:00.000Z",
  "type": "composio.connected_account.expired",
  "data": {
    "id": "ca_xyz789",
    "status": "EXPIRED",
    "integration_id": "ac_def456",
    "app_name": "gmail",
    "app_unique_id": "gmail",
    "entity_id": "user_123",
    "created_at": "2025-01-15T10:00:00.000Z",
    "updated_at": "2026-02-04T12:00:00.000Z"
  }
}
```

<Note>
The `data` object matches the response from `GET /api/v3/connected_accounts/{id}`, making it easy to process with existing code.
</Note>

### Subscribing to Connection Expiry Events

```bash
curl -X POST "https://backend.composio.dev/api/v3/webhook_subscriptions" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://your-server.com/webhooks/composio",
    "enabled_events": [
      "composio.trigger.message",
      "composio.connected_account.expired"
    ],
    "version": "V3"
  }'
```

### Verifying Webhook Signatures

All webhooks include an HMAC-SHA256 signature in the `x-composio-signature` header. Verify it to ensure the webhook is authentic:

```python
import hmac
import hashlib

def verify_webhook(payload: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)
```

```typescript
import { createHmac, timingSafeEqual } from "crypto";

function verifyWebhook(payload: Buffer, signature: string, secret: string): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

## Available Event Types

Query available events and their version compatibility:

```bash
curl "https://backend.composio.dev/api/v3/webhook_subscriptions/event_types" \
  -H "x-api-key: YOUR_API_KEY"
```

| Event Type | Description | Supported Versions |
|------------|-------------|-------------------|
| `composio.trigger.message` | Trigger events from integrations | V1, V2, V3 |
| `composio.connected_account.expired` | Connection auth expired | V3 only |

## Deprecations

### Deprecated Endpoints

The following legacy endpoints are deprecated. They continue to work but will be removed in a future release.

| Deprecated Endpoint | Replacement |
|---------------------|-------------|
| `GET /api/v3/org/project/webhook` | `GET /api/v3/webhook_subscriptions` |
| `POST /api/v3/org/project/webhook/update` | `POST /api/v3/webhook_subscriptions` |
| `DELETE /api/v3/org/project/webhook` | `DELETE /api/v3/webhook_subscriptions/{id}` |
| `POST /api/v3/org/project/webhook/refresh` | `POST /api/v3/webhook_subscriptions/{id}/rotate_secret` |

### Deprecated Fields in Project Response

The following fields in project API responses are deprecated:

| Field | Status | Notes |
|-------|--------|-------|
| `webhook_url` | Deprecated | Use Webhook Subscriptions API |
| `webhook_secret` | Deprecated | Use Webhook Subscriptions API |
| `event_webhook_url` | Deprecated | Never implemented |
| `is_new_webhook` | Deprecated | Use `webhook_version` |

<Note>
**`webhook_version` is NOT deprecated.** It controls the payload format for Pusher real-time events, which is separate from webhook delivery. For webhook configuration, use the new Webhook Subscriptions API.
</Note>

## Migration Guide

### Who Should Migrate?

- **Using project webhook settings**: Migrate to the new API for better control
- **Need connection expiry notifications**: Use the new `composio.connected_account.expired` event
- **New projects**: Use Webhook Subscriptions API from the start

### Migration Steps

1. **Create a webhook subscription** with your existing URL and events:

```bash
curl -X POST "https://backend.composio.dev/api/v3/webhook_subscriptions" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "webhook_url": "https://your-existing-webhook-url.com/webhook",
    "enabled_events": ["composio.trigger.message"],
    "version": "V3"
  }'
```

2. **Update your webhook handler** to verify signatures using the new secret

3. **Test the new endpoint** receives events correctly

4. **(Optional)** Add `composio.connected_account.expired` to your enabled events

<Note>
When you create a webhook subscription, the legacy `project.webhookURL` is automatically cleared to prevent duplicate deliveries.
</Note>

### Backward Compatibility

- Legacy endpoints continue to work during the deprecation period
- Existing project webhook configurations remain functional
- No immediate action required, but migration is recommended

## Technical Details

### HTTPS Requirement

Webhook URLs must use HTTPS in production environments. HTTP is only allowed in local development (`COMPOSIO_ENV=local`).

### Rate Limits

- Maximum 1 webhook subscription per project (will be expanded in future releases)
- Webhook delivery includes automatic retries with exponential backoff

### Payload Versions

| Version | Format | Use Case |
|---------|--------|----------|
| V1 | Legacy flat structure | Backward compatibility |
| V2 | Nested with metadata | Existing integrations |
| V3 | Modern envelope format | New integrations (recommended) |

## Resources

- [Webhook Verification Guide](/docs/capabilities/webhooks/verification)
- [Triggers Overview](/docs/capabilities/triggers)
- [Connected Accounts API](/api-reference/connected-accounts)
