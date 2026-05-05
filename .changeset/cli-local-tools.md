---
'@composio/cli': patch
'@composio/cli-local-tools': patch
---

Scaffold the CLI local-tools foundation package, wire it into Tool Router search/execute sessions, and expose `composio local-tools list|doctor|configure|meta` for discovery, readiness checks, setup hints, and local metadata state. Concrete app integrations are added in follow-up stack PRs.
