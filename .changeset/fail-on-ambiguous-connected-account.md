---
'@composio/cli': patch
---

`composio tools execute` and `composio proxy` now fail with an error listing the candidate accounts, instead of silently using the newest one, when a toolkit has several connected accounts, none is aliased `default`, and no `--account` is passed. Pass `--account <alias or id>` to choose one. Scripts that relied on the implicit newest-account pick will now need an explicit `--account`.
