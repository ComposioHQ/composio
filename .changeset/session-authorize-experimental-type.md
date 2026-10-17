---
'@composio/core': patch
---

Add the missing `experimental` option to the `ToolRouterAuthorizeFn` type. `session.authorize()` already accepted `experimental: { accountType, aclConfigForShared }` at runtime, but sessions returned by `composio.create()` and `composio.use()` rejected it at compile time.
