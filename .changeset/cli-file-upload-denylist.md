---
'@composio/cli': patch
---

Security: the CLI's tool file-upload path now enforces the sensitive-file denylist (issue #3746 / GHSA-hp3h-89pf-5q58). Previously `composio execute`/`composio run` read and uploaded any local path a tool argument pointed at — including `~/.ssh/id_rsa`, `~/.aws/credentials`, and `.env` files — enabling credential exfiltration in agentic workflows via prompt injection. The CLI now calls the shared `assertSafeFileUploadPath` guard from `@composio/core` at the lowest-level file read, matching the core and Python SDKs. URLs and `File` objects are unaffected.
