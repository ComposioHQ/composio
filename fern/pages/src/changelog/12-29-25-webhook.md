## Lookahead Announcement

We're introducing **Webhook Payload V3** - a redesigned webhook structure that follows industry standards and provides better developer experience. This update affects how you receive trigger events via webhooks and Pusher.

## What's Changing?

### New Webhook Structure

We're adopting the [Standard Webhooks specification](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md) for better consistency and reliability.

#### Headers
A new header will identify the webhook version:
```
x-composio-webhook-version: V3
```

#### Payload Structure
The payload structure is being reorganized to separate Composio metadata from trigger data:

**Before (V2):**
```json
{
  "log_id": "log_TpxVOLXYnwXZ",
  "timestamp": "2025-12-23T13:06:07.695Z",
  "type": "gmail_new_gmail_message",
  "data": {
    "connection_id": "a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "connection_nano_id": "ca_xYz9AbCdEfGh",
    "trigger_nano_id": "ti_JZFoTyYKbzhB",
    "trigger_id": "7f8e9d0c-1b2a-3c4d-5e6f-7a8b9c0d1e2f",
    "user_id": "usr-demo-12a3b4c5...",
    // ... actual trigger data mixed with metadata
  }
}
```

**After (V3):**
```json
{
  "id": "msg_a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
  "timestamp": "2025-12-23T13:06:07.695Z",
  "type": "composio.trigger.message",
  "metadata": {
    "log_id": "log_TpxVOLXYnwXZ",
    "trigger_slug": "GMAIL_NEW_GMAIL_MESSAGE",
    "auth_config_id": "ac_aCYTppZ5RsRc",
    "connected_account_id": "ca_cATYssZ5RrSc",
    "trigger_id": "ti_JZFoTyYKbzhB",
    "user_id": "pg-test-86c9fc84..."
  },
  "data": {
    // Clean trigger data without Composio metadata
  }
}
```

### Key Improvements

1. **Metadata Separation**: Composio-specific fields (connection IDs, trigger IDs, user IDs) are now in a dedicated `metadata` object
2. **Clean Data**: The `data` field now contains only the actual trigger payload without infrastructure metadata
3. **Standardized Type Field**: The `type` field now follows a consistent format (`composio.trigger.message`) instead of trigger-specific names like `gmail_new_gmail_message`
4. **Trigger Slug in Metadata**: The trigger slug (e.g., `GMAIL_NEW_GMAIL_MESSAGE`) is now available in `metadata.trigger_slug` for easy identification
5. **Standards Compliance**: Follows Standard Webhooks specification for better interoperability
6. **Consistent Structure**: Same payload structure for both webhooks and Pusher channels

## Migration Guide

### Updating Your Webhook Handlers

If you're accessing Composio metadata fields, update your code:

```python
# Before (V2)
trigger_type = payload["type"]  # "gmail_new_gmail_message"
connection_id = payload["data"]["connection_id"]
trigger_id = payload["data"]["trigger_id"]
message_text = payload["data"]["message_text"]

# After (V3)
trigger_type = payload["type"]  # "composio.trigger.message"
trigger_slug = payload["metadata"]["trigger_slug"]  # "GMAIL_NEW_GMAIL_MESSAGE"
connection_id = payload["metadata"]["connected_account_id"]
trigger_id = payload["metadata"]["trigger_id"]
message_text = payload["data"]["message_text"]
```

```typescript
// Before (V2)
const triggerSlug = payload.type;  // "gmail_new_gmail_message"
const connectionId = payload.data.connection_id;
const triggerId = payload.data.trigger_id;
const messageText = payload.data.message_text;

// After (V3)
const webhookType = payload.type;  // "composio.trigger.message"
const triggerSlug = payload.metadata.trigger_slug;  // "GMAIL_NEW_GMAIL_MESSAGE"
const connectionId = payload.metadata.connected_account_id;
const triggerId = payload.metadata.trigger_id;
const messageText = payload.data.message_text;
```

### Checking Webhook Version

You can detect the webhook version from headers:

```python
webhook_version = headers.get("x-composio-webhook-version", "V2")
if webhook_version == "V3":
    # Use new structure
    metadata = payload["metadata"]
else:
    # Use old structure
    metadata = payload["data"]
```

## Rollout Timeline

- **December 2025**: V3 released, opt-in via project settings
- **February 15, 2026**: All new organizations will default to V3
- **Existing organizations**: Continue using V2 by default, can opt-in to V3 anytime

## How to Opt-In

1. Go to your project settings in the Composio dashboard
2. Navigate to the Webhooks section
3. Select "Webhook Payload Version: V3"
4. Update your webhook handlers to use the new structure
5. Test thoroughly before enabling in production

<Note>
Organizations created **before February 15, 2026** will remain on V2 by default. You can switch to V3 at your convenience.

Organizations created **on or after February 15, 2026** will use V3 by default.
</Note>

## Benefits

- **Better DX**: Clear separation between metadata and actual trigger data
- **Standards Compliance**: Follows industry-standard webhook specifications
- **Consistency**: Same structure across webhooks and Pusher channels
- **Future-Proof**: Built on established standards for long-term compatibility

## Need Help?

If you have questions about migrating to V3 or need assistance:
- Join our [Discord community](https://discord.gg/composio)
- Check our [documentation](https://docs.composio.dev)
- Contact support at support@composio.dev

---

*This is a lookahead announcement. Actual release dates and features may vary slightly.*

