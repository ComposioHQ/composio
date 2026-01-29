# Composio Core Files - Cloudflare Workers E2E Test

This package tests `@composio/core` file operations in Cloudflare Workers environment.

## Purpose

Verifies that:
1. `composio.files.upload()` throws the expected "not supported in Cloudflare Workers" error
2. `composio.files.download()` throws the expected "not supported in Cloudflare Workers" error
3. The `FileToolModifier.workerd.ts` is correctly loaded and provides the expected error message when `autoUploadDownloadFiles` is explicitly enabled
4. Composio initializes correctly with the default configuration (`autoUploadDownloadFiles: false` in workerd runtime)
5. Composio can be explicitly initialized with `autoUploadDownloadFiles: false`

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Lists all available test endpoints |
| `GET /test/files/upload` | Tests that `files.upload()` throws the expected error |
| `GET /test/files/download` | Tests that `files.download()` throws the expected error |
| `GET /test/file-modifier/error-message` | Tests the error when `autoUploadDownloadFiles: true` is explicitly set |
| `GET /test/auto-upload-disabled` | Tests Composio initialization with explicit `autoUploadDownloadFiles: false` |
| `GET /test/default-config` | Tests Composio initialization with default configuration (no explicit setting) |

## Running Tests

```bash
# From the package directory
pnpm test:e2e

# Or from the monorepo root
pnpm --filter @e2e-tests/cf-workers-files test:e2e:cloudflare
```

## Environment Variables

Copy `.env.example` to `.env` and set your API key:

```bash
COMPOSIO_API_KEY=your-composio-api-key
```

Note: For file operation tests, a dummy API key works since the operations throw errors before making API calls.

## Default Configuration

**In Cloudflare Workers (workerd runtime), `autoUploadDownloadFiles` defaults to `false`.**

This means you can initialize Composio without any special configuration:

```typescript
const composio = new Composio({
  apiKey: 'your-key',
});
// autoUploadDownloadFiles is false by default in workerd
```

## FileToolModifier Error

If you explicitly set `autoUploadDownloadFiles: true` and execute a tool with file properties in Cloudflare Workers, the following error is thrown:

```
File upload/download modifiers are not available on edge runtimes yet.
Please set `autoUploadDownloadFiles: false` or run Composio in another JS runtime (Node.js / Bun).
```

### Best Practice

For edge runtimes, use the default configuration or explicitly set `autoUploadDownloadFiles: false`:

```typescript
const composio = new Composio({
  apiKey: 'your-key',
  autoUploadDownloadFiles: false, // This is the default for workerd
});
```

Note that with this configuration, file upload/download operations will not be automatically handled.
