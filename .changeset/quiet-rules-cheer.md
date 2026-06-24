---
'@composio/core': minor
---

Remove the deprecated `uuid` field from the auth config retrieve/list response type.

The platform has removed the deprecated V1/V2 UUID-mirror field from V3 API responses (it was a mirror of the canonical nanoid `id`). The SDK no longer reads or re-exposes `uuid` on `AuthConfigRetrieveResponse` (and therefore on the items of `AuthConfigListResponse`).

This is technically a breaking change to the SDK response type: consumers should use `id` instead of `uuid`. The `expectedInputFields` field is unaffected — it remains a top-level field on the API response.
