# Triggers Example

This example demonstrates how to use Composio SDK for triggers.

## Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   
   Then edit `.env` and add your API keys:
   - `COMPOSIO_API_KEY`: Get it from [Composio Dashboard](https://app.composio.dev)
   - `COMPOSIO_WEBHOOK_SECRET`: Get it from your webhook configuration in Composio Dashboard

## Running the Examples

### Trigger Subscription (WebSocket)

```bash
# Run the subscription example
pnpm start

# Run in development mode (with file watching)
pnpm dev
```

### Webhook Server (HTTP)

```bash
# Start the webhook verification server
pnpm webhook:server

# Then expose it with telebit (https://telebit.cloud/)
telebit http 3000
```

## What This Example Does

### `src/index.ts` - Trigger Subscription
- Initializes Composio SDK
- Subscribes to triggers via WebSocket
- Receives real-time trigger events

### `src/webhook-server.ts` - Webhook Verification
- Starts a Bun HTTP server on port 3000
- Verifies incoming webhook signatures using the new `verifyWebhook` API
- Supports V1, V2, and V3 webhook payload formats
- Returns normalized trigger events

## Webhook Headers

When receiving webhooks, the following headers are used:
- `webhook-id`: Unique message ID (format: `msg_xxx`)
- `webhook-timestamp`: Unix timestamp in seconds
- `webhook-signature`: Signature in format `v1,base64EncodedSignature`

## Customization

Edit `src/index.ts` or `src/webhook-server.ts` to:
- Add specific apps you want to integrate with
- Implement your business logic
- Add error handling and logging

## Related Examples

- [OpenAI Example](../openai) - Shows integration with OpenAI
- [LangChain Example](../langchain) - Shows integration with LangChain
- [More Examples](../) - Browse all available examples

## Support

- [Documentation](https://docs.composio.dev)
- [Discord Community](https://discord.gg/composio)
- [GitHub Issues](https://github.com/composio/composio/issues)
