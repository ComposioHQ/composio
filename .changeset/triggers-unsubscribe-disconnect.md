---
'@composio/core': patch
'@composio/slim': patch
---

Disconnect the pusher-js websocket when `triggers.unsubscribe()` clears the last subscription, matching the Python SDK's `stop()`. Concurrent first `subscribe()` calls share one in-flight client init so only one connection opens, and `unsubscribe()` during setup cancels that init so a connection is never opened after cleanup.
