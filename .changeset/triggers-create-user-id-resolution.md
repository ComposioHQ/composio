---
"@composio/core": patch
---

`triggers.create` no longer makes an extra `connectedAccounts.list()` call to resolve a connection from `user_id`. The backend now resolves the first active connection for the user and the trigger's toolkit when `connected_account_id` is omitted (parity with tool execution), so the SDK passes `user_id` straight through to the upsert call.
