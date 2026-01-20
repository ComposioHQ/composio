# Composio Core Files - Cloudflare Workers E2E Test

This package tests `@composio/core` file operations in Cloudflare Workers environment.

## Purpose

Verifies that:
1. `composio.files.upload()` throws the expected "not supported in Cloudflare Workers" error
2. `composio.files.download()` throws the expected "not supported in Cloudflare Workers" error
3. The `FileToolModifier.workerd.ts` is correctly loaded and provides the expected error message for `autoUploadDownloadFiles`
4. Composio can be initialized with `autoUploadDownloadFiles: false` as a workaround for edge runtimes

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Lists all available test endpoints |
| `GET /test/files/upload` | Tests that `files.upload()` throws the expected error |
| `GET /test/files/download` | Tests that `files.download()` throws the expected error |
| `GET /test/file-modifier/error-message` | Returns the expected error message from `FileToolModifier.workerd.ts` |
| `GET /test/auto-upload-disabled` | Tests Composio initialization with `autoUploadDownloadFiles: false` |

## Running Tests

```bash
# From the package directory
pnpm test:e2e

# Or from the monorepo root
pnpm --filter @test-e2e/cf-workers-files test:e2e:cloudflare
```

## Environment Variables

Copy `.env.example` to `.env` and set your API key:

```bash
COMPOSIO_API_KEY=your-composio-api-key
```

Note: For file operation tests, a dummy API key works since the operations throw errors before making API calls.

## FileToolModifier Error

When `autoUploadDownloadFiles: true` (default) and a tool with file properties is executed in Cloudflare Workers, the following error is thrown:

```
File upload/download modifiers are not available on edge runtimes yet.
Please set `autoUploadDownloadFiles: false` or run Composio in another JS runtime (Node.js / Bun).
```

### Workaround

To use Composio in edge runtimes without this error:

```typescript
const composio = new Composio({
  apiKey: 'your-key',
  autoUploadDownloadFiles: false,
});
```

Note that with this configuration, file upload/download operations will not be automatically handled.
