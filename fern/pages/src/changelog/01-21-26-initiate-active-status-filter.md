# Connected Account Initiate Now Filters by ACTIVE Status

## Version Information

### TypeScript/JavaScript
- Package: `@composio/core`
- Version: `0.5.4`+

### Python
- Package: `composio`
- Version: `0.10.9`+

---

The `initiate()` method now only considers ACTIVE connected accounts when checking for duplicates. Previously, expired or inactive accounts would incorrectly trigger the multiple accounts error.

## What Changed

When calling `connectedAccounts.initiate()`, the SDK now filters by `statuses: ["ACTIVE"]` when checking for existing accounts. This prevents expired or inactive accounts from blocking new connection creation.

### Before (Bug)

```typescript
// Expired accounts would incorrectly trigger ComposioMultipleConnectedAccountsError
await composio.connectedAccounts.initiate(userId, authConfigId);
// ❌ Error: Multiple connected accounts found (even if they're all expired)
```

### After (Fixed)

```typescript
// Only ACTIVE accounts are considered
await composio.connectedAccounts.initiate(userId, authConfigId);
// ✅ Works - expired/inactive accounts are ignored
```

## Affected SDKs

- **TypeScript**: `@composio/core`
- **Python**: `composio`

## Backward Compatibility

This is a bug fix with no breaking changes. The behavior now matches the expected intent of the multiple accounts check.
