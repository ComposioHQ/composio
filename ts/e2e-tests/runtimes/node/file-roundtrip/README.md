# Node.js File Upload Round-Trip Integrity Test

Verifies that `@composio/core` can upload a file and download it back without corruption.

## Why This Exists

This suite is meant to catch regressions where file content is altered during upload (for example, sending base64 text instead of raw bytes).

It performs a real round-trip:

- Upload deterministic binary bytes via the SDK
- Download the uploaded object back
- Verify **size** and **SHA-256 checksum** match the original bytes

## What It Tests

| Test | Description |
| ---- | ----------- |
| Upload | Uploads a deterministic binary payload via `composio.files.upload()` |
| Download | Downloads the uploaded object back from storage |
| Integrity | Compares byte length and SHA-256 checksum |

## Requirements

This suite requires a real API key.

- `COMPOSIO_API_KEY` (**required**) – Composio API key
- `COMPOSIO_BASE_URL` (optional) – override backend base URL

If `COMPOSIO_API_KEY` is not set, the suite is skipped.

## Isolation Tool

**Docker** with Node.js versions: current (as specified in `.nvmrc`).

This ensures the behavior is tested against specific Node.js versions independent of the developer's local setup.

## Running

```bash
pnpm test:e2e
```
