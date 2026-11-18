---
'@composio/core': minor
'@composio/slim': minor
'@composio/python-sdk': minor
---

Choose which Composio-managed app an auth config uses. `composio.toolkits.get(slug)` returns `composioManagedAuth` in TypeScript, one entry per managed app with `managedAppId` and `isDefault`. Pass that id as `managedAppId` (TypeScript) or `managed_app_id` (Python) to `composio.authConfigs.create` / `composio.auth_configs.create`; omit it for the toolkit's default app. Auth config create, get and list responses return `managedAppId` in TypeScript (`null` when the auth config isn't on a managed app).
