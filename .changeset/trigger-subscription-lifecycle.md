---
'@composio/core': patch
'@composio/slim': patch
---

Fix the trigger subscription lifecycle and contain errors from trigger handlers.

- `triggers.unsubscribe()` now closes the realtime connection, so a Node process can exit once it has unsubscribed. A later `triggers.subscribe()` opens a new connection.
- `triggers.unsubscribe()` before any `subscribe()` no longer fetches realtime credentials or creates a client.
- Concurrent `subscribe()` calls share one connection, and `unsubscribe()` cancels a subscription that is still connecting, so it never opens a connection or delivers events afterwards.
- A rejected promise from an `async` trigger handler is logged like a synchronous throw instead of escaping as an unhandled rejection that ends the process. Handler failures log the error's message rather than `{}`.
