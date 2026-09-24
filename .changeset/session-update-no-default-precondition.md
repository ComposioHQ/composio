---
'@composio/core': patch
---

`session.update()` no longer sends `expected_config_version` by default. Since 0.20.0 it sent the session's last observed `configVersion` on every call, and the API rejects that field with a 400 (`Unrecognized key(s) in object: 'expected_config_version'`), so every default `update()` failed. The default is now last writer wins. Pass `expectedConfigVersion` (for example `session.configVersion`) to make an update conditional where the API supports it; `expectedConfigVersion: false` is the same as omitting it.
