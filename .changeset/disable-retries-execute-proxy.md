---
'@composio/core': patch
---

Disable client retries on `tools.execute` and `tools.proxyExecute`. These are non-idempotent writes, so a silent retry after a read timeout could duplicate the side effect (e.g. send the same email more than once). Both now route through a sibling client built with `maxRetries: 0`; reads keep the default retry behaviour.
