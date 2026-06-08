---
'@composio/core': patch
---

Fix a credential leak in the Python SDK's trigger subscription: when a webhook event failed to parse, `TriggerSubscription._handle_event` logged the entire raw event string at `ERROR` level. Provider webhook payloads can carry `access_token`, `oauth_token`, and other secrets, so a parse failure wrote those credentials into log files (issue #2963).

The error log now records only the payload length (`len=...`) and an explicit note that the payload was omitted, instead of interpolating the raw event. No secret material reaches the logs while parse failures stay observable.
