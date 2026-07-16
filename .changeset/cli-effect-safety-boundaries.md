---
'@composio/cli': patch
---

Harden CLI failure and response boundaries. Tool execution input and setup failures now retain typed Effect errors while still producing a non-zero process exit, and `composio link --list` emits an allowlisted connected-account summary instead of serializing credential-bearing generated-client fields such as `state` and `data`.
