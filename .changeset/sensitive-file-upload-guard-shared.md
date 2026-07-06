---
'@composio/core': minor
---

Export the sensitive-file-upload denylist guard from the package root so downstream packages share one implementation: `assertSafeFileUploadPath`, `isBlockedSensitiveFileUploadPath`, and `BUILTIN_FILE_UPLOAD_PATH_DENY_SEGMENTS`. The guard now routes its filesystem access through the internal `#platform` abstraction (adding a `realpathSync` platform method), so it is edge/workerd-safe and the module carries no static `node:*` imports. Behavior on Node/Bun is unchanged.
