---
'@composio/core': patch
---

Validate the server-supplied mount path before `RemoteFile.save()` turns it into a filename. A `mountRelativePath` of `""`, `"."` or `"sub/."` basenames to nothing usable, which made the save path equal its own parent directory, and `"foo/.."` or `".."` pointed at the directory above it — each surfacing as an unhandled `EISDIR` from `writeFileSync`, after the target directory had already been created. These now throw a `ValidationError` naming the offending mount path, and the check runs before any `mkdir` or write so a rejected response leaves nothing on disk. A `path` passed explicitly by the caller is unaffected.

The new `safeBasename` helper ports the Python SDK's `safe_basename` (tracked there as SEC-316), so both SDKs reject the same malformed response: no separators, traversal, NUL or control characters, no Windows-reserved character or device name, and a 128-byte limit measured in UTF-8 bytes. It splits on both `/` and `\`, because `path.basename()` on POSIX leaves a Windows-style name such as `..\..\evil` intact. The usability check is applied to the trimmed basename, so a name wrapped in Unicode whitespace such as `"\u00a0.\u00a0"` or `"\u2007..\u2007"` cannot survive trimming as `.` or `..`.

One deliberate variance from Python: `"sub/."` is rejected here rather than reduced to `"sub"`, because Node's `path.basename()` yields `"."` where Python's `pathlib` drops the trailing component. The containment re-check that Python performs in `secure_basename_join` is not ported — `safeBasename` already guarantees a bare path component, so anchoring a containment check on the constant download directory could not fail, and without symlink resolution it would not catch a symlink either.
