---
'@composio/core': patch
'@composio/slim': patch
---

Contain rejections from async `triggers.subscribe()` handlers so a handler that rejects is logged instead of escaping as an unhandled rejection that ends the Node process. Errors from trigger handlers are now logged with their message instead of `{}`.
