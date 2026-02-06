# Webhook Subscriptions API

A new API for managing webhook configurations with event filtering, HMAC signature verification, and support for platform lifecycle events. This replaces the legacy project-level webhook settings with a more flexible, subscription-based model.

## Summary

| Change | Type | Action Required |
|--------|------|-----------------|
| New Webhook Subscriptions API | New Feature | No |
| `composio.connected_account.expired` event | New Feature | Opt-in |
| Legacy webhook endpoints | Deprecated | Migration recommended |
| `webhook_url`, `webhook_secret` in Project | Deprecated | Use new API |

---

## New Webhook Subscriptions API

A dedicated API for creating and managing webhook endpoints with granular event filtering.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v3/webhook_subscriptions` | Create a subscription |
| `GET` | `/api/v3/webhook_subscriptions` | List all subscriptions |
| `GET` | `/api/v3/webhook_subscriptions/{id}` | Get subscription details |
| `PATCH` | `/api/v3/webhook_subscriptions/{id}` | Update subscription |
| `DELETE` | `/api/v3/webhook_subscriptions/{id}` | Delete subscription |
| `POST` | `/api/v3/webhook_subscriptions/{id}/rotate_secret` | Rotate signing secret |
| `GET` | `/api/v3/webhook_subscriptions/event_types` | List available event types |

### Key Capabilities

- **Event filtering**: Subscribe only to events you need
- **HMAC-SHA256 signatures**: Every webhook includes a cryptographic signature for verification
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
  "secret": "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890",
  "created_at": "2026-02-06T12:00:00.000Z",
  "updated_at": "2026-02-06T12:00:00.000Z"
}
```

<Warning>
The `secret` is only returned once at creation time or when rotated. Store it securely for signature verification.
</Warning>

### Requirements

- **1 subscription per project**: Currently limited to one webhook subscription per project. This will be expanded in future releases.
- **HTTPS required**: Webhook URLs must use HTTPS in production environments.

---

## New Event: `composio.connected_account.expired`

A new platform event that notifies you when a connected account's authentication expires and cannot be automatically refreshed.

<Note>
This event is **only available in V3 format**. We strongly recommend using V3 for all new integrations to access the latest features and follow standard webhook practices.
</Note>

### Use Cases

- Prompt users to re-authenticate before workflows fail
- Track connection health across your user base
- Automate re-connection flows
- Build proactive notification systems

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

### Payload Structure

The `composio.connected_account.expired` event follows the V3 envelope format:

```json
{
  "id": "evt_847cdfcd-d219-4f18-a6dd-91acd42ca94a",
  "timestamp": "2026-02-06T12:00:00.000Z",
  "type": "composio.connected_account.expired",
  "metadata": {
    "project_id": "pr_abc123",
    "org_id": "org_xyz789"
  },
  "data": {
    "toolkit": {
      "slug": "gmail"
    },
    "auth_config": {
      "id": "ac_def456",
      "auth_scheme": "OAUTH2",
      "is_composio_managed": true,
      "is_disabled": false
    },
    "id": "ca_ghi789",
    "status": "EXPIRED",
    "created_at": "2025-12-01T10:00:00.000Z",
    "updated_at": "2026-02-06T12:00:00.000Z",
    "status_reason": "OAuth refresh token expired",
    "is_disabled": false
  }
}
```

<Note>
The `data` object matches the response from `GET /api/v3/connected_accounts/{id}`, making it easy to process with existing code and SDK types.
</Note>

### Key Fields

| Field | Description |
|-------|-------------|
| `id` | Unique event identifier |
| `timestamp` | ISO 8601 timestamp when the event was generated |
| `type` | Always `composio.connected_account.expired` for this event |
| `metadata.project_id` | Your project identifier |
| `metadata.org_id` | Your organization identifier |
| `data.id` | The connected account ID (use this to prompt re-authentication) |
| `data.toolkit.slug` | The integration that expired (e.g., `gmail`, `slack`) |
| `data.status` | Will be `EXPIRED` |
| `data.status_reason` | Human-readable reason for expiration |

---

## Verifying Webhook Signatures

All webhooks include an HMAC-SHA256 signature in the `x-composio-signature` header. Always verify signatures to ensure webhooks are authentic.

**Python:**

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

# Usage
is_valid = verify_webhook(
    payload=request.body,
    signature=request.headers.get("x-composio-signature"),
    secret="a1b2c3d4e5f67890..."  # Your webhook secret
)
```

**TypeScript:**

```typescript
import { createHmac, timingSafeEqual } from "crypto";

function verifyWebhook(payload: Buffer, signature: string, secret: string): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// Usage
const isValid = verifyWebhook(
  Buffer.from(JSON.stringify(req.body)),
  req.headers["x-composio-signature"] as string,
  "a1b2c3d4e5f67890..."  // Your webhook secret
);
```

For detailed verification examples in more languages, see the [Triggers documentation](https://docs.composio.dev/docs/triggers).

---

## Available Event Types

Query available events and their version compatibility:

```bash
curl "https://backend.composio.dev/api/v3/webhook_subscriptions/event_types" \
  -H "x-api-key: YOUR_API_KEY"
```

| Event Type | Description | Supported Versions |
|------------|-------------|-------------------|
| `composio.trigger.message` | Trigger events from integrations | V1, V2, V3 |
| `composio.connected_account.expired` | Connection authentication expired | **V3 only** |

---

## Deprecations

### Deprecated Endpoints

The following legacy endpoints are deprecated and will be removed in a future release:

| Deprecated Endpoint | Replacement |
|---------------------|-------------|
| `GET /api/v3/org/project/webhook` | `GET /api/v3/webhook_subscriptions` |
| `POST /api/v3/org/project/webhook/update` | `POST /api/v3/webhook_subscriptions` |
| `DELETE /api/v3/org/project/webhook` | `DELETE /api/v3/webhook_subscriptions/{id}` |
| `POST /api/v3/org/project/webhook/refresh` | `POST /api/v3/webhook_subscriptions/{id}/rotate_secret` |

### Deprecated Fields in Project Response

| Field | Status | Notes |
|-------|--------|-------|
| `webhook_url` | Deprecated | Use Webhook Subscriptions API |
| `webhook_secret` | Deprecated | Use Webhook Subscriptions API |
| `event_webhook_url` | Deprecated | Never implemented |
| `is_new_webhook` | Deprecated | Use Webhook Subscriptions API |

---

## Backward Compatibility

<Warning>
**No immediate action required.** Your existing webhook configurations will continue to work.
</Warning>

### What We've Done For You

- **Automatic migration**: We've created a webhook subscription for all existing projects that had webhook URLs configured
- **No duplicate deliveries**: Legacy and new systems don't send duplicate webhooks
- **Same payload format**: If you were using V1, V2, or V3 triggers, they continue with the same format

### What Continues to Work

- Legacy webhook endpoints (deprecated but functional)
- Existing project webhook configurations
- All existing trigger payload formats (V1, V2, V3)
- Signature verification with your existing secret

### Recommended Actions

While not required, we recommend migrating to benefit from:

1. **Event filtering**: Only receive events you care about
2. **New events**: Access `composio.connected_account.expired` (V3 only)
3. **Better secret management**: Rotate secrets without downtime
4. **Future features**: New events will only be available via subscriptions

---

## Migration Guide

Your existing webhook configuration has been automatically migrated. No action is required for your webhooks to continue working.

### Using the New API

Start using the new endpoints instead of the legacy ones:

```bash
# List your webhook subscriptions
curl "https://backend.composio.dev/api/v3/webhook_subscriptions" \
  -H "x-api-key: YOUR_API_KEY"
```

### (Optional) Enable New Events

Add `composio.connected_account.expired` to receive connection expiry notifications:

```bash
curl -X PATCH "https://backend.composio.dev/api/v3/webhook_subscriptions/{id}" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled_events": [
      "composio.trigger.message",
      "composio.connected_account.expired"
    ]
  }'
```

---

## Payload Version Comparison

| Version | Format | Recommendation |
|---------|--------|----------------|
| V1 | Legacy flat structure | For backward compatibility only |
| V2 | Nested with metadata | For existing integrations |
| **V3** | Modern envelope format | **Recommended for all new integrations** |

V3 follows industry standards with a consistent envelope containing `id`, `timestamp`, `type`, `metadata`, and `data`.

