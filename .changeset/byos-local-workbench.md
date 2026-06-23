---
'@composio/core': patch
---

Add experimental BYO local workbench primitives under `@composio/core/experimental`.

The v0 local workbench authenticates sandbox tool execution with the developer's Composio project API key, keeps sandbox provider selection SDK-local, and exposes a provider-agnostic `SandboxProvider` contract for additional adapters.
