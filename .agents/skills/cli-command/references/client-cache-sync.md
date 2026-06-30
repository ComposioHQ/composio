# Client Cache Sync

When modifying `ts/packages/cli/src/services/composio-clients.ts`, inspect `ts/packages/cli/src/services/composio-clients-cached.ts` in the same change.

The cached repository wraps `ComposioToolkitsRepository` and must expose the same interface.

Checklist:

- New method: add a cached or passthrough implementation.
- Signature change: update both services.
- Removed method: remove both entries.
- New exported error type: export or map it consistently.
- Validation methods are usually passthrough.
- Fetch/list methods are usually cached.

Verification:

```bash
pnpm --filter @composio/cli typecheck
pnpm --filter @composio/cli test
```
