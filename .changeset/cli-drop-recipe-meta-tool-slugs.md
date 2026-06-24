---
'@composio/cli': patch
---

Drop `COMPOSIO_UPSERT_RECIPE` and `COMPOSIO_GET_RECIPE` from the CLI meta-tool list. These slugs were removed from `@composio/client` (alpha.74), so listing them broke the type-checked CLI build.
