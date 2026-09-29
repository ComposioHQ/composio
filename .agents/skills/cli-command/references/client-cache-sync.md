# Client Cache Sync

`ts/packages/cli/src/services/composio-clients-cached.ts` spreads the underlying `ComposioToolkitsRepository` from `ts/packages/cli/src/services/composio-clients.ts` and overrides only the methods it caches: `getToolkits`, `getToolkitsBySlugs`, `getToolsAsEnums`, `getTriggerTypesAsEnums`, `getTriggerTypes`, and `getTools`.

Checklist:

- New passthrough method: add it to the repository only; the spread exposes it.
- New full-catalog fetch that should be cached: add a cached override.
- Signature or result change on a cached method: update both services.
- Removed cached method: remove its override.
- Validation, search, single-item, and CRUD methods stay passthrough.

Verification:

```bash
pnpm --filter @composio/cli typecheck
pnpm --filter @composio/cli test
```
