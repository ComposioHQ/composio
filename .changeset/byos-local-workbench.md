---
'@composio/core': patch
'@composio/experimental': patch
---

Add the experimental BYO local workbench package with a provider-agnostic sandbox interface, an E2B implementation, and the TypeScript Composio tool helper shim.

Core now accepts the experimental workbench provider toggle and exposes a create-response workbench access key when the backend returns one.
