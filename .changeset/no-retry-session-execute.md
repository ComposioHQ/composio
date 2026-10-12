---
'@composio/core': patch
---

Stop retrying session tool executions and proxied calls. `session.execute()`, `session.proxyExecute()`, provider-wrapped session tools, and the `execute` / `proxyExecute` helpers passed to custom tools no longer retry after a timeout, connection error, or 408/409/429/5xx response, so a retry can no longer repeat a side effect such as sending the same email twice. This matches `tools.execute()` and `tools.proxyExecute()`.
