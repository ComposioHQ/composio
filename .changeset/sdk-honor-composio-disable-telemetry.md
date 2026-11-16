---
'@composio/core': patch
'@composio/python-sdk': patch
---

Honor `COMPOSIO_DISABLE_TELEMETRY` in the TypeScript and Python SDKs

The docs tell you to set `COMPOSIO_DISABLE_TELEMETRY=true` to turn SDK telemetry off, but only the CLI read the variable. Both SDKs kept sending usage and error telemetry unless you also passed `allowTracking: false` (TypeScript) or `allow_tracking=False` (Python).

Both SDKs now read the variable the way the CLI does. Unset, blank, `0`, `false`, `no`, and `off` (any casing) leave telemetry on. Any other value turns it off. The variable wins over an explicit `allowTracking: true` or `allow_tracking=True`. The existing switches (`allowTracking: false`, `allow_tracking=False`, and `TELEMETRY_DISABLED=true` in the TypeScript SDK) keep working.
