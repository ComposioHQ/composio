---
'@composio/cli': patch
---

- Make top-level `composio search`, `composio link`, and `composio execute` consumer-only
- Keep developer-scoped usage under `composio manage ...`
- Remove developer-only flags from root help and add short related-command hints
- Use `consumer_user_id` from consumer project resolve for consumer flows
- Execute: Default to empty object `{}` when no -d/--data or piped stdin provided
- Search CTA: Use `-d "{}"` for tools with no schema properties (shell-safe)
