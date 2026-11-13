---
'@composio/json-schema-to-zod': patch
---

Accept a UTC offset in `format: "time"` strings, so RFC 3339 times like `10:30:00Z` and `10:30:00+05:30` validate instead of being rejected.
