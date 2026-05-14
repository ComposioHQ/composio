---
"@composio/cli": patch
---

CLI now sends its per-cwd session id as the `x-cli-session-id` header on every request. The backend uses this to tag tool execution logs with `session_info.cli_session_id`, so all tool executions from a single CLI session (one cwd, one user) can be grouped together in the logs UI.
