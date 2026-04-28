---
'@composio/core': minor
---

Make automatic file upload/download opt-in and add scoped allowlist controls.

- **Removed:** the legacy `autoUploadDownloadFiles` constructor option. Code that sets it must migrate to the new opt-in flag.
- **Added:** `dangerouslyAllowAutoUploadDownloadFiles` (default `false`). When `true`, the SDK collapses `file_uploadable` schemas to `{ type: 'string', format: 'path' }` for the model and stages local paths/URLs at execute time.
- **Added:** `fileUploadDirs?: string[] | false` — fail-closed allowlist for local upload paths. `undefined` defaults to `[<home>/.composio/temp]`; `false` rejects all local paths; an explicit `string[]` replaces the default.
- **Added:** `fileDownloadDir?: string` — directory used to stage S3 downloads on `file_downloadable` results.
- **Added:** `beforeFileUpload` modifier now receives `source: 'path' | 'url' | 'file'` so hooks can branch on the original input type.
- **Added:** when auto-upload is **off** but a tool with `file_uploadable` inputs is executed, the SDK emits a one-shot warning per tool slug pointing at `composio.files.upload()` for manual staging.

See the changelog entry at [`docs/content/changelog/04-24-26-legacy-auto-upload-config-removal.mdx`](https://github.com/ComposioHQ/composio/blob/master/docs/content/changelog/04-24-26-legacy-auto-upload-config-removal.mdx) for migration steps.

Provider packages that depend on `@composio/core` receive automatic patch bumps in the same release train via the changesets `updateInternalDependencies: "patch"` setting — no public-API change in those packages.
