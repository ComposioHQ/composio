---
'@composio/core': patch
---

Limit trigger webhook request bodies to 10 MiB by default in `triggers.parse()`. Set `maxBodyBytes` to customize the limit or to check an already-buffered payload in `triggers.verifyWebhook()`.
