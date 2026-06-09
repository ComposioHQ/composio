---
"@composio/cli": patch
---

fix: route fish shell completions to `~/.config/fish/completions/composio.fish` (instead of the rc file) and sanitize completion lines that could break parsing.
fix: permission "allow" decisions now expire after 1 hour — the prompt action is relabeled "Allow for 1 hr" and cached decisions are pruned on expiry.
