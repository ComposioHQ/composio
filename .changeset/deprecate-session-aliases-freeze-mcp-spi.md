---
'@composio/core': minor
---

Two pre-v1 API-hygiene fixes:

- **Remove the bare `composio.create(...)` / `composio.use(...)` aliases** in favour of `composio.sessions.create(...)` / `composio.sessions.use(...)`, so the root object hosts namespaces rather than generic verbs. This is a breaking TypeScript SDK change, released as a pre-v1 minor.
- **Un-deprecate `BaseProvider.wrapMcpServerResponse`** and retain it as the intended v1 SPI method. Its `@deprecated` note pointed at a plural `wrapMcpServers` method that was never added; the singular method is the contract we intend to freeze for v1.
