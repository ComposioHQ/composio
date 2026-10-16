---
'@composio/core': patch
'@composio/slim': patch
---

Warn once per toolkit version when the API reports it as deprecated through the `Composio-Deprecated-Toolkits` response header. The warning names the version, the sunset date and how to pin a newer version. Silence it with `logLevel: 'error'` or `COMPOSIO_LOG_LEVEL=error`.
