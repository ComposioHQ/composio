---
'@composio/core': patch
---

Defer telemetry batch and error sends so instrumentation does not wait for telemetry network requests before returning SDK results or rethrowing SDK errors.
