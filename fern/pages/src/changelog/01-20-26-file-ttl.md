# File handling in tool execution now uses presigned URLs

## Summary

Files involved in tool execution are now shared via presigned URLs with a default TTL (time-to-live) of 1 hour. You can customize the file TTL through your project configuration.

## What changed

When tools return files (images, documents, exports, etc.), these files are now delivered as presigned URLs with a configurable TTL instead of non-expiring URLs. This provides:

- **Automatic cleanup** - Files expire after the configured TTL
- **Configurable retention** - Adjust file availability based on your application's needs

## Default behavior

All files returned from tool execution now have a **1 hour TTL** by default. After this period, the presigned URLs expire and files are no longer accessible.

## Configuring file TTL

You can adjust the file TTL to match your application's needs.

### Via Dashboard

1. Navigate to **Project Settings** in your Composio dashboard
2. Find the **File TTL** configuration option
3. Set your desired TTL value

### Via API

Use the [Update Project Config API](https://docs.composio.dev/rest-api/projects/patch-org-project-config) to programmatically configure the file TTL:

```bash
curl -X PATCH "https://backend.composio.dev/api/v3/org/projects/config" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "fileTtl": 3600
  }'
```

## Impact

| Aspect | Before | After |
|--------|--------|-------|
| File delivery | Non-expiring URLs | Presigned URLs with TTL |
| Default expiry | None | 1 hour |
| TTL customization | Not available | Configurable via project settings |

## Migration

No code changes are required. Your existing integrations will continue to receive file URLs as before, but these URLs will now expire after the configured TTL.

If your application stores or caches file URLs for later use, ensure you handle URL expiration appropriately by either:
- Downloading files before the TTL expires
- Re-executing the tool to obtain fresh URLs when needed
- Increasing the TTL via project settings to match your retention requirements
