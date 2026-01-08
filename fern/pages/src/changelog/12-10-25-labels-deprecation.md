# Removal of label query parameter from connected accounts API

The `label` query parameter has been removed from the `GET /api/v3/connected_accounts` endpoint.

## What's changing?

The `label` query parameter is no longer supported when listing connected accounts. This parameter was previously accepted but had no functional behavior since label ingestion was removed in an earlier update.

## Impact

**None** - This is a cleanup change. The `label` query parameter was not performing any filtering since the underlying label ingestion functionality was already removed. If your code was passing this parameter, it was being silently ignored.

## Migration

No action required. If your code was passing the `label` query parameter, you can safely remove it from your API calls.
