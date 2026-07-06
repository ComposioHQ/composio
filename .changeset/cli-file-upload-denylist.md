---
'@composio/cli': patch
---

Security: the CLI's tool file-upload path now enforces the sensitive-file denylist (issue #3746 / GHSA-hp3h-89pf-5q58). Previously `composio execute`/`composio run` read and uploaded any local path a tool argument pointed at — including `~/.ssh/id_rsa`, `~/.aws/credentials`, and `.env` files — enabling credential exfiltration in agentic workflows via prompt injection. The CLI now calls the shared `assertSafeFileUploadPath` guard from `@composio/core` at the lowest-level file read. URLs and `File` objects are unaffected.

Unlike the core and Python SDKs (which expose a `sensitiveFileUploadProtection` / `sensitive_file_upload_protection` opt-out), the CLI enforces the denylist **unconditionally by design** — the primary attack vector is an agent prompt-injected into supplying its own tool arguments, so a CLI override flag would hand that attacker a trivial bypass. The block error carries CLI-appropriate remediation guidance instead of pointing at the SDK-only flag.
