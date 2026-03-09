# Tool Router Session Files

Tool Router sessions include a virtual filesystem mount that enables file storage and retrieval within a session. This is useful for agent workflows, document processing, and tools that need to read or write files. Access the files API via `session.files` on any Tool Router session.

> **Related:**
> - [Tool Router](./tool-router.md) – Session creation, configuration, and `session.files` overview
> - [Auto Upload and Download](../advanced/auto-upload-download.md) – File handling during tool execution (different feature)

## Overview

Each Tool Router session has a `files` property that provides:

- **List** – Browse files and directories with cursor-based pagination
- **Upload** – Upload files from paths, URLs, native `File` objects, or raw buffers
- **Download** – Get presigned download URLs and `RemoteFile` instances
- **Delete** – Remove files or directories from the mount

Files are stored in a virtual filesystem attached to the session. Tools executing in the session can access these files (e.g., at `/mnt/files/` inside the sandbox). The mount ID defaults to `"files"` and can be overridden when using custom mounts.

## Quick Start

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const session = await composio.create('default');

// Upload a file
const file = await session.files.upload('/path/to/report.pdf');
console.log('Uploaded:', file.mountRelativePath);

// List files
const { items, nextCursor } = await session.files.list({ path: '/' });

// Download a file
const remoteFile = await session.files.download('report.pdf');
const buffer = await remoteFile.buffer();
await remoteFile.save('/tmp/report.pdf');
```

## List Files

List files and directories at a path on the session's file mount. Supports cursor-based pagination.

### Method Signature

```typescript
session.files.list(options?: ToolRouterSessionFilesMountListOptions): Promise<FileListResponse>
```

### Options

| Option   | Type   | Default | Description                                                |
| -------- | ------ | ------- | ---------------------------------------------------------- |
| `path`   | string | -       | Directory path to list. Use `"/"` for root.                 |
| `mountId`| string | `"files"` | The file mount ID.                                      |
| `cursor` | string | -       | Pagination cursor from the previous response's `nextCursor`. |
| `limit`  | number | -       | Max files per page (1–500).                                |

### Response

```typescript
interface FileListResponse {
  items: Array<{
    lastModified: string;      // ISO 8601 timestamp
    mountRelativePath: string; // e.g. "report.pdf"
    sandboxMountPrefix: string; // e.g. "/mnt/files"
    size: number;             // File size in bytes
  }>;
  nextCursor?: string;        // Present when more pages exist
}
```

### Examples

```typescript
// List root directory
const { items } = await session.files.list({ path: '/' });

// List a subdirectory
const { items } = await session.files.list({ path: '/documents' });

// Paginated listing
let result = await session.files.list({ path: '/', limit: 10 });
while (result.nextCursor) {
  result = await session.files.list({
    path: '/',
    cursor: result.nextCursor,
    limit: 10,
  });
}
```

## Upload Files

Upload files to the session's mount. Accepts multiple input types: file paths (local or URL), native `File` objects, or raw buffers (`ArrayBuffer` | `Uint8Array`).

### Method Signature

```typescript
session.files.upload(
  input: string | File | ArrayBuffer | Uint8Array,
  options?: ToolRouterSessionFilesMountUploadOptions
): Promise<RemoteFile>
```

### Input Types

| Input Type | Description | Example |
| ---------- | ----------- | ------- |
| `string` | Local path or HTTP(S) URL | `'/path/to/file.pdf'`, `'https://example.com/file.pdf'` |
| `File` | Native browser/Node `File` | `inputElement.files[0]` |
| `ArrayBuffer` | Raw binary buffer | `await file.arrayBuffer()` |
| `Uint8Array` | Typed array buffer | `new TextEncoder().encode('hello')` |

### Upload Options

| Option    | Type   | Default | Description |
| --------- | ------ | ------- | ----------- |
| `remotePath` | string | - | Remote path/filename on the mount. Required when passing a buffer (provides filename; mimetype defaults to `application/octet-stream`). |
| `mountId` | string | `"files"` | The file mount ID. |
| `mimetype` | string | - | MIME type. Required when passing a buffer unless `remotePath` is provided. Ignored when passing `File` (uses `file.type`). |

### How It Works

1. **Path (string)** – If the path starts with `http://` or `https://`, the file is fetched from the URL. Otherwise it is read from the local filesystem. The filename is derived from the path or URL.
2. **File** – Used directly. Filename comes from `file.name` unless `remotePath` is provided.
3. **Buffer** – Wrapped in a `File` object. **Either `mimetype` or `remotePath` must be provided.** If only `remotePath` is given, mimetype defaults to `application/octet-stream`. If only `mimetype` is given, a filename is generated from the extension (`upload-{id}.{ext}`).

### Examples

```typescript
// From local path
const file = await session.files.upload('/path/to/report.pdf');

// From URL
const file = await session.files.upload('https://example.com/document.pdf');

// From native File (e.g. file input)
const file = await session.files.upload(fileInput.files[0]);

// From buffer with explicit path and mimetype
const buffer = new TextEncoder().encode('{"key": "value"}');
const file = await session.files.upload(buffer, {
  remotePath: 'data.json',
  mimetype: 'application/json',
});

// From buffer – mimetype or remotePath required
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...]);
const file = await session.files.upload(pngBytes, {
  remotePath: 'screenshot.png',
  mimetype: 'image/png',
});
```

## Download Files

Get a `RemoteFile` for a file on the mount. The `RemoteFile` provides a presigned download URL and methods to fetch content.

### Method Signature

```typescript
session.files.download(
  filePath: string,
  options?: ToolRouterSessionFilesMountDownloadOptions
): Promise<RemoteFile>
```

### Parameters

- `filePath` – Path of the file on the mount (e.g. `"report.pdf"`, `"output/data.csv"`).
- `options.mountId` – Mount ID (default: `"files"`).

### RemoteFile

The returned `RemoteFile` has:

| Property | Type | Description |
| -------- | ---- | ----------- |
| `expiresAt` | string | ISO 8601 when the download URL expires |
| `mountRelativePath` | string | Path within the mount |
| `sandboxMountPrefix` | string | Absolute mount path (e.g. `/mnt/files`) |
| `downloadUrl` | string | Presigned URL for downloading |
| `filename` | string | Basename of the path |

Methods:

- `buffer()` – Fetch content as `Uint8Array`
- `text()` – Fetch content as UTF-8 string
- `blob()` – Fetch content as `Blob`
- `save(path?)` – Download and save to disk (Node.js only; path defaults to `~/.composio/files/`)

### Examples

```typescript
const remoteFile = await session.files.download('/output/report.pdf');

// Fetch content
const buffer = await remoteFile.buffer();
const text = await remoteFile.text();

// Save to disk (Node.js)
await remoteFile.save('/tmp/report.pdf');
await remoteFile.save(); // Uses ~/.composio/files/{filename}
```

## Delete Files

Delete a file or directory from the mount.

### Method Signature

```typescript
session.files.delete(
  remotePath: string,
  options?: ToolRouterSessionFilesMountDeleteOptions
): Promise<FileDeleteResponse>
```

### Examples

```typescript
await session.files.delete('/temp/cache.json');
await session.files.delete('/old-backup', { mountId: 'custom-mount' });
```

## Type Reference

### ToolRouterSessionFilesMountListOptions

```typescript
interface ToolRouterSessionFilesMountListOptions {
  path?: string;
  mountId?: string;   // default: "files"
  cursor?: string;
  limit?: number;     // 1-500
}
```

### ToolRouterSessionFilesMountUploadOptions

```typescript
interface ToolRouterSessionFilesMountUploadOptions {
  remotePath?: string;
  mountId?: string;   // default: "files"
  mimetype?: string;
}
```

### FileListResponse

```typescript
interface FileListResponse {
  items: Array<{
    lastModified: string;
    mountRelativePath: string;
    sandboxMountPrefix: string;
    size: number;
  }>;
  nextCursor?: string;
}
```

### RemoteFile (from download/upload)

```typescript
interface RemoteFile {
  readonly expiresAt: string;
  readonly mountRelativePath: string;
  readonly sandboxMountPrefix: string;
  readonly downloadUrl: string;
  readonly filename: string;

  buffer(): Promise<Uint8Array>;
  text(): Promise<string>;
  blob(): Promise<Blob>;
  save(path?: string): Promise<string>;  // Node.js only
}
```

## Exports

The following are exported from `@composio/core`:

- `FileListResponse` – List response type
- `ToolRouterSessionFilesMountListOptions` – List options type
- `RemoteFile` – File class with `buffer`, `text`, `blob`, `save`
- `getExtensionFromMimeType` – Map MIME type to file extension

## Platform Support

- **Node.js** – Full support (paths, `save()`).
- **Bun** – Full support.
- **Browser** – Paths and `save()` are limited; use `File` or buffers.
- **Cloudflare Workers / Edge** – No filesystem; use `File` or buffers only.
