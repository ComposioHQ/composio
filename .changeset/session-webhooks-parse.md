---
'@composio/core': minor
'@composio/slim': minor
'@composio/python-sdk': minor
---

Read session webhook events with `composio.sessions.webhooks.parse()`. A session hook with a `webhook` handler sends each tool or proxy call it applies to, before or after it runs, to the project's session webhook URL and waits for the endpoint's answer. `parse({ body, headers, verifySecret })` (TypeScript) / `parse(body=..., headers=..., verify_secret=...)` (Python) verifies the signature with the project's session webhook secret, which is required, and returns the typed event with the field names of the webhook reference. `SessionWebhookBeforeExecuteResponse` and `SessionWebhookAfterExecuteResponse` type the answer.
