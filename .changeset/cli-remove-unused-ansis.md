---
'@composio/cli': patch
---

Remove the unused `ansis` dependency from the CLI. Colored output is already handled by `picocolors`, so `ansis` was a dead production dependency that shipped with the package.
