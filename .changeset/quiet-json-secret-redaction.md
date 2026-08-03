---
'@composio/core': patch
---

Redact secrets that appear inside JSON payloads in telemetry error text. The key/value rule required the separator to follow the key name directly, so a serialized body such as `{"api_key": "..."}` — the shape error messages usually carry — was sent unredacted.
