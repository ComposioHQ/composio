---
'@composio/core': patch
---

Correct the code examples in the TypeScript SDK reference, which also ships in the package under `dist/docs`. Each class's Usage block now shows its real accessor, such as `composio.webhooks.endpoints` instead of the nonexistent `composio.webhookEndpoints`, and each example compiles against the SDK as written. Examples now import what they use, declare their own inputs, call methods that exist with their current parameters (for example `composio.mcp` instead of `composio.experimental.mcp`, `AuthScheme.APIKey`, and the `id` and `timestamp` fields of `triggers.verifyWebhook`), and split alternatives into separate examples.
