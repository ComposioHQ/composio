---
'@composio/core': patch
---

Treat local file paths that begin with `http` as paths instead of URLs, ensuring that upload allowlist and sensitive-file denylist checks still run.
