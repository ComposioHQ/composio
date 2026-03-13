---
'@composio/cli': patch
---

CLI v0.2.2: interactive login picker, --no-wait for link, whoami security

### What's New

- **Interactive org/project picker** after `composio login` (use `-y` to skip)
- **`--no-wait`** flag for `composio link` — print URL/JSON and exit without waiting
- **Whoami** no longer exposes API keys (security improvement)

### Breaking Changes

- Removed `--api-key`, `--org-id`, `--project-id` from `composio login` and `composio init`
- Non-interactive login/init via flags is no longer supported; use browser flow with `-y` for login
