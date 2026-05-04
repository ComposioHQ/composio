# Tool Router Session Files E2E Test

End-to-end test for the Tool Router session files mount API (list, upload, download, delete).

## Prerequisites

- Docker (for running tests in containers)
- `COMPOSIO_API_KEY` environment variable

## Running

```bash
# From repo root
COMPOSIO_API_KEY=your_key pnpm test:e2e:node --filter=@e2e-tests/node-tool-router-files

# Or from this directory
COMPOSIO_API_KEY=your_key bun test e2e.test.ts
```

## What it tests

1. **Create session** – Creates a minimal tool router session
2. **Upload** – Uploads a text buffer with `remotePath` and `mimetype`
3. **List** – Lists files at mount root and verifies the uploaded file appears
4. **Download** – Downloads the file and verifies content
5. **Delete** – Deletes the file
