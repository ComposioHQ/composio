---
'@composio/core': minor
'@composio/slim': minor
---

`composio.triggers.create()` accepts `type` (`'webhook'` or `'poll'`, for a trigger that supports both) and `pollingInterval` (minutes between polls, which wins over `triggerConfig.interval`), and returns the instance's `type`, `fallbackReason` and `pollingInterval` along with `triggerId`. `composio.triggers.listActive()` items carry the same three fields, and `getType()` / `listTypes()` return each trigger type's `type`, `types` and `requiresWebhookEndpointSetup`.
