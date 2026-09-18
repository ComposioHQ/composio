---
'@composio/core': patch
---

Validate the server-supplied mount path before `RemoteFile.save()` turns it into a filename. A `mountRelativePath` of `""`, `"."`, `"sub/."`, `"foo/.."` or `".."` made the default save path equal the download directory or its parent, which surfaced as an unhandled `EISDIR` from `writeFileSync` after the directory had already been created. These now throw a `ValidationError` naming the offending mount path, before any `mkdir` or write. An explicit `path` passed by the caller is unaffected.

The new `safeBasename` helper mirrors `safe_basename` in the Python SDK check for check: both `/` and `\` count as separators, and NUL or control characters, Windows-reserved characters and device names, trailing spaces or dots, invalid Unicode and names over 128 UTF-8 bytes are rejected. `RemoteFile.filename` now also splits on both separators, so a Windows-style mount path reduces to the same display name on every platform.
