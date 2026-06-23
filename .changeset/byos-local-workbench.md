---
'@composio/core': patch
'@composio/experimental': patch
---

Add experimental BYO local workbench primitives under `@composio/core/experimental`, plus an optional `@composio/experimental` package with an E2B sandbox adapter.

The v0 local workbench authenticates sandbox tool execution with the developer's Composio project API key, keeps sandbox provider selection SDK-local, and exposes a provider-agnostic `SandboxProvider` contract for additional adapters.
