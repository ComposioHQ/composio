---
'@composio/core': minor
'@composio/slim': minor
---

Requires `@composio/client` `2.0.0-rc.23`. `composio.sessionConfigs.list()` no longer sends `search`, which the Composio API removed: the option is deprecated, ignored, and logs a warning when set; filter `items` by name instead. With rc.23, the client returned by `getClient()` no longer has `cli.createCodactFailure` (now under `client._internal`, typed through `@composio/client/internal`) or `org.clanker.createClaim`, and its `sessionConfigs.list()` no longer accepts `search`.
