# Direct REST toolkit-version defaults

Retrieved: 2026-08-10

Sources:

- https://docs.composio.dev/reference/api-reference/tools/getTools
- https://docs.composio.dev/docs/tools-direct/toolkit-versioning.md
- `context7.json` at the repository root

For a new direct REST integration, use API v3.1. On the five v3.1 tool endpoints listed in `context7.json`, omitting the toolkit version selects the latest toolkit version. On v3, omission selects the pinned base version `00000000_00`.

Name the REST API version explicitly. If current API reference or verified endpoint behavior conflicts with a page marked Legacy, the current API reference and live behavior win.
