---
'@composio/core': minor
'@composio/slim': minor
---

Requires `@composio/client` `2.0.1`. Adds `composio.experimental.customToolkits.create()` and `update()`, which call the v3.1 custom toolkit create and update endpoints. `create()` takes `userId` (`'all'` to share the toolkit, or the user it is private to), generates the slug, and returns a `connectLink` for a private toolkit. `upsert()` is deprecated and logs a warning once per process; it keeps working.

API-key auth schemes accept `additionalFields.genericId` with a required `displayName` and optional `description` to collect the value used by `{{generic_id}}` headers.
