---
'@composio/cli': patch
---

Fix `composio whoami` reporting the wrong organization after `composio orgs switch`. The command resolved session info without the `x-org-id` header, so the backend fell back to the API key's home org and ignored the switch. It now forwards the selected global org, matching how consumer commands resolve org context.
