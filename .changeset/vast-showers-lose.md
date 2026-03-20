---
'@composio/cli': patch
---

- Execute: Default to empty object `{}` when no -d/--data or piped stdin provided
- Search CTA: Use `-d "{}"` for tools with no schema properties (shell-safe)
