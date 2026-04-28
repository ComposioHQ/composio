# Composio Class

The `Composio` class is the main entry point to the Composio SDK. It initializes the SDK and provides access to all the core functionality.

## Initialization

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: 'your-api-key',
  baseURL: 'https://api.composio.dev', // Optional: Custom API endpoint
  allowTracking: true, // Optional: Enable/disable telemetry
  dangerouslyAllowAutoUploadDownloadFiles: false, // Optional: set to true to opt in to automatic file handling (default: false)
  sensitiveFileUploadProtection: true, // Optional: block uploads from sensitive paths (Node; default true)
  fileUploadPathDenySegments: undefined, // Optional: extra path component denylist
  fileUploadDirs: undefined, // Optional: allowlist for automatic upload (defaults to [~/.composio/temp])
  fileDownloadDir: undefined, // Optional: where auto-downloaded files are written (defaults to ~/.composio/files)
  provider: new OpenAIProvider(), // Optional: Custom provider
});
```

## Configuration Options

The `Composio` constructor accepts a configuration object with the following properties:

| Property                 | Type                     | Required | Default                    | Description                                    |
| ----------------------- | ------------------------ | -------- | -------------------------- | ---------------------------------------------- |
| `apiKey`                | string                   | Yes      | -                          | Your Composio API key                          |
| `baseURL`               | string                   | No       | `https://api.composio.dev` | The base URL for the Composio API              |
| `allowTracking`         | boolean                  | No       | `true`                     | Whether to allow analytics/tracking            |
| `dangerouslyAllowAutoUploadDownloadFiles` | boolean          | No       | `false`                    | Opt in to automatic file upload/download during tool execution |
| `sensitiveFileUploadProtection` | `boolean`        | No       | `true` (Node)              | When true, local upload paths are checked against a denylist of sensitive segments and credential-like names before read/upload. |
| `fileUploadPathDenySegments` | `string[]`         | No       | `undefined`                | Additional path *components* merged with the built-in denylist. |
| `fileUploadDirs`        | `string[] \| false`      | No       | `[~/.composio/temp]`       | Allowlist of directories from which the SDK may read local files during **automatic** upload (when `dangerouslyAllowAutoUploadDownloadFiles: true`). Pass `false` (or `[]`) to reject every local path; URLs and `File`/`Blob` objects still work. Providing a list **replaces** the default — include `~/.composio/temp` explicitly if you want the default staging dir to keep working. Does **not** affect manual `composio.files.upload()` calls. |
| `fileDownloadDir`       | `string`                 | No       | `~/.composio/files`        | Directory where files downloaded during tool execution (and `composio.files.download()`) are written. Relative paths resolve against `process.cwd()` at SDK-init time. |
| `provider`              | `BaseComposioProvider`   | No       | `new OpenAIProvider()`     | The provider to use for this Composio instance |

## Properties

The `Composio` class provides access to the following core models:

| Property            | Type                   | Description                                |
| ------------------- | ---------------------- | ------------------------------------------ |
| `tools`             | `Tools`                | Access to tools functionality              |
| `toolkits`          | `Toolkits`             | Access to toolkits functionality           |
| `triggers`          | `Triggers`             | Access to triggers functionality           |
| `authConfigs`       | `AuthConfigs`          | Access to auth configs functionality       |
| `connectedAccounts` | `ConnectedAccounts`    | Access to connected accounts functionality |
| `files`             | `Files`                | Access to file upload/download functionality|
| `provider`          | `BaseComposioProvider` | The provider being used                    |


## Methods

### getClient()

Returns the internal Composio API client.

```typescript
const client = composio.getClient();
```

**Returns:** `ComposioClient`

**Throws:** Error if the client is not initialized

## Examples

### Basic Initialization

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});
```

### Custom Provider

```typescript
import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai';

const openaiProvider = new OpenAIProvider();
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: openaiProvider,
});
```

### Disable Tracking

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  allowTracking: false,
});
```

### Automatic file handling (opt-in)

Automatic upload/download of file-marked tool fields is **off** by default. Set `dangerouslyAllowAutoUploadDownloadFiles: true` only if you intend to use that behavior:

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  dangerouslyAllowAutoUploadDownloadFiles: true,
});
```

#### What the LLM sees vs. what the SDK does

The flag is a **contract between the SDK and the model**. The schema handed
to the LLM always reflects what will actually happen at runtime:

- **Flag `true`** — `composio.tools.get(...)` rewrites `file_uploadable`
  inputs down to `{ type: 'string', format: 'path' }`. The model passes a
  path or URL, the SDK stages it, the backend receives a proper
  `{ name, mimetype, s3key }` object. Works end-to-end.
- **Flag `false`** (or omitted) — the raw backend shape
  (`{ name, mimetype, s3key }`) is preserved. You are expected to stage
  files yourself via `composio.files.upload(...)` and inject the returned
  descriptor into the tool arguments before calling `tools.execute`. Handing
  this shape directly to an LLM is not recommended — the model cannot
  produce a valid `s3key`. On first execution of a file-uploadable tool in
  this mode, the SDK emits a single warning per tool slug nudging you
  toward either enabling the flag or staging manually.

Manual staging example (flag off):

```typescript
const staged = await composio.files.upload({
  file: '/tmp/report.pdf',
  toolSlug: 'SOME_FILE_TOOL',
  toolkitSlug: 'some-toolkit',
});

await composio.tools.execute('SOME_FILE_TOOL', {
  userId: 'u',
  arguments: { file: staged }, // { name, mimetype, s3key }
});
```

### Per-execution `beforeFileUpload` modifier

Use the **third argument** to `composio.tools.execute` to intercept each file read before upload (in addition to global `sensitiveFileUploadProtection` on the client):

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY! });

await composio.tools.execute(
  'SOME_FILE_TOOL',
  { userId: 'u', arguments: { file: '/tmp/report.pdf' }, dangerouslySkipVersionCheck: true },
  {
    beforeFileUpload: async ({ path, source, toolSlug, toolkitSlug }) => {
      // `source` discriminates the input:
      //   'path' — a local filesystem path
      //   'url'  — an http(s):// URL
      //   'file' — a File object; `path` is `file.name` (filename only)
      if (source !== 'path') return path; // let URLs / File objects through
      // return path, a different path, or false to abort
      return path;
    },
  }
);
```

See [Auto upload and download](./advanced/auto-upload-download.md#security-sensitive-local-paths) for the security model and error types.

### Restricting automatic uploads to specific directories

When `dangerouslyAllowAutoUploadDownloadFiles: true`, the SDK only reads local
files from directories in `fileUploadDirs`. This stacks with (it does NOT
replace) the sensitive-path denylist.

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY!,
  dangerouslyAllowAutoUploadDownloadFiles: true,
  // User-provided list REPLACES the default `[~/.composio/temp]`.
  // Include it explicitly if you want staged uploads to keep working.
  fileUploadDirs: ['/srv/agent/uploads', '~/.composio/temp'],
});
```

A local path is accepted if its symlink-resolved absolute path is inside one
of these directories on a path-component boundary. Paths outside the allowlist
throw `ComposioFileUploadPathNotAllowedError`. Missing files throw
`ComposioFileNotFoundError`. URLs (`http(s)://...`) and `File`/`Blob` objects
are not path-checked.

**Manual upload API (`composio.files.upload(...)`) is _not_ subject to this
allowlist** — it bypasses the allowlist check entirely. Use the allowlist to
constrain what models/agents can ask the SDK to upload during tool execution.

#### Blocking local paths entirely

Pass `false` to allow only URLs and in-memory `File`/`Blob` objects during
automatic upload:

```typescript
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY!,
  dangerouslyAllowAutoUploadDownloadFiles: true,
  fileUploadDirs: false, // reject every filesystem path for auto-upload
});
```

`fileUploadDirs: []` behaves identically; prefer `false` for readability.

### Changing the download directory

```typescript
import { Composio } from '@composio/core';

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY!,
  fileDownloadDir: '/var/app/composio-downloads',
});
```

Files returned by tools as `s3url` are streamed into this directory. The
default is `~/.composio/files`.
