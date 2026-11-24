---
'@composio/core': minor
'@composio/slim': minor
'@composio/python-sdk': minor
---

Session hooks accept a `webhook` handler. `composio.sessions.create()` and `session.update()` take `handler: { type: 'webhook', fallbackAction, timeoutMs }` (TypeScript) or `{"type": "webhook", "fallback_action": ..., "timeout_ms": ...}` (Python) on a `before_execute` or `after_execute` hook. Composio sends each call the hook applies to, before or after it runs, to the project's session webhook URL and waits for your endpoint to let it run, block it, or change it; read the request there with `composio.sessions.webhooks.parse()`. `fallbackAction` is what happens when the endpoint can't answer. A hook result with `status: 'unavailable'` now carries `detail`, the reason the hook could not be evaluated. The event `composio.sessions.webhooks.parse()` returns types `metadata.tool_call_id`, which pairs a call's `before_execute` event with its `after_execute`.
