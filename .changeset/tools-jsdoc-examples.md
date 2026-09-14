---
'@composio/core': patch
---

Correct the JSDoc for `tools.getInput` and `tools.proxyExecute`. The `getInput` example now passes the required `text` field and reads the generated `arguments`. The `proxyExecute` example now uses the flat `endpoint` / `method` / `connectedAccountId` shape and explains that a relative endpoint is appended to the toolkit's base URL, which can already include a path. The `tools.execute` example shows where to find the version to pin.
