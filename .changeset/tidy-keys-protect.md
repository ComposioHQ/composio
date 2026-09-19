---
'@composio/core': patch
---

Add an opt-in strict mode to `ssrfSafeFetch` that rejects configured network
routes when the connection cannot be pinned to the validated address.
