---
'@composio/core': major
---

Two v1 freeze-hygiene fixes:

- **Remove the bare `composio.create(...)` / `composio.use(...)` aliases** in favour of `composio.sessions.create(...)` / `composio.sessions.use(...)`, so the root object hosts namespaces rather than generic verbs. This is a breaking TypeScript SDK change.
- **Un-deprecate `BaseProvider.wrapMcpServerResponse`** and freeze it as the stable v1 SPI method. Its `@deprecated` note pointed at a plural `wrapMcpServers` method that was never added; the singular method is the frozen contract.
