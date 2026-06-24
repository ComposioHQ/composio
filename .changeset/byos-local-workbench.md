---
'@composio/core': patch
---

Add experimental BYO local workbench primitives under `@composio/core/experimental`.

The v0 local workbench assumes code is already running in the developer's sandbox, disables Composio remote workbench tools on the Tool Router session, and exposes Apollo-parity Python helpers for `run_composio_tool`, `invoke_llm`, and `web_search` using the developer's project API key.
