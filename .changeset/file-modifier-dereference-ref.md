---
'@composio/core': patch
---

Resolve `$ref`/`$defs` indirection for tool file handling so `file_uploadable` / `file_downloadable` flags hidden behind a reference are no longer silently ignored.

Two coupled causes were defeating reference resolution for tools whose parameter schemas use `$ref`/`$defs` (e.g. `GMAIL_GET_ATTACHMENT`, whose `output_parameters` express the downloadable field as `data` → `$ref` → `#/$defs/GetAttachmentResponse` → `file` → `$ref` → `#/$defs/FileDownloadable`):

- `ParametersSchema` is a strict `z.object` and omitted `$defs`/`definitions`, so `ToolSchema.parse` dropped the root definition block on every tool — leaving each nested `$ref` dangling and unresolvable for all downstream consumers (providers that pass `inputParameters` straight to the model, the file modifier, etc.). `JSONSchemaPropertySchema` already accepted both keywords; the parameters root now does too.
- The file tool modifier's schema walkers (`transformProperties`, `schemaHasFileProperty`, and the upload/download hydration) recurse `properties`/`anyOf`/`oneOf`/`allOf`/`items` but never dereferenced `$ref`. A `file_uploadable` field reachable only through a `$ref` was therefore invisible, so the local path was forwarded as-is and the backend rejected the call. The modifier now dereferences `inputParameters`/`outputParameters` (via `dereferenceJsonSchema` in `'sentinel'` mode) before walking, so refs are inlined while tools that ship a `$ref` without a matching `$defs` target keep working instead of throwing.
