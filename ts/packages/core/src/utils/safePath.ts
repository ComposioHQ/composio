/**
 * Filename containment for untrusted input.
 *
 * Every field of an API response is untrusted, including filenames. When such a
 * value becomes part of a filesystem path it must pass through this module
 * first: validation happens before any `mkdir` or write, so a rejected value
 * leaves nothing behind on disk.
 *
 * This is the TypeScript counterpart to `safe_basename` in
 * `python/composio/utils/safe_path.py`, which the Python SDK already routes
 * `RemoteFile.save()` through (tracked there as SEC-316). Keeping the two in
 * step is what makes a malformed response behave the same in both SDKs.
 *
 * The module is pure string logic with no filesystem access, so it stays free of
 * static `node:*` imports and is safe to use from edge/workerd builds.
 */
import { ValidationError } from '../errors/ValidationErrors';

/**
 * Upper bound on a filename, well under the 255-byte limit common to
 * ext4/APFS/NTFS. Keeps a long server-supplied name from raising a raw
 * `ENAMETOOLONG` mid-write. Matches `MAX_COMPONENT_LENGTH` in the Python SDK.
 */
export const MAX_FILENAME_BYTES = 128;

/**
 * Reserved DOS device names. Writing to one on Windows targets the device
 * rather than a file. Rejected on every platform so behavior does not diverge
 * between a POSIX developer machine and a Windows deployment.
 */
const WINDOWS_RESERVED_NAMES: ReadonlySet<string> = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
  ...['¹', '²', '³'].flatMap(superscript => [`COM${superscript}`, `LPT${superscript}`]),
]);

/** Characters that are legal on POSIX but reserved by Windows. */
const WINDOWS_RESERVED_CHARS = /[<>:"|?*]/;

/** Control characters, which no legitimate filename contains. */
const CONTROL_CHARS = /[\u0000-\u001f]/;

/**
 * Returns the last path segment, treating both `/` and `\` as separators.
 *
 * `platform.basename()` is `path.basename()`, which on POSIX only splits on
 * `/` — so a name crafted for a Windows target (`..\..\evil`) comes back
 * intact on macOS and Linux. Splitting on both mirrors Python's
 * `PureWindowsPath(name).name`, which is why the Python SDK strips such a name
 * even when it runs on POSIX.
 */
function lastSegment(value: string): string {
  const segments = value.split(/[/\\]+/);
  // Trailing separators name the same file: `a/b/` and `a/b` both basename to `b`.
  while (segments.length > 0 && segments[segments.length - 1] === '') {
    segments.pop();
  }
  return segments[segments.length - 1] ?? '';
}

/**
 * True when `value` contains a surrogate code unit that is not part of a valid
 * pair. Such a string cannot be encoded as UTF-8; `TextEncoder` silently
 * substitutes U+FFFD, which would write a file under a name the caller never
 * asked for. Detected by hand because `String.prototype.isWellFormed()` is
 * ES2024 and this package targets es2022.
 */
function hasLoneSurrogate(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true;
      }
      i++; // A valid pair; skip its trailing half.
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true; // A trailing half with no leading half before it.
    }
  }
  return false;
}

/**
 * Collapses an untrusted filename to a bare, writable basename.
 *
 * Filenames need their own validator: a path *component* check would forbid
 * `.`, which nearly every real filename contains. This applies the remaining
 * rules — no separators, no traversal, no NUL or control characters, bounded
 * length, no reserved device name — to the one component a server most directly
 * controls.
 *
 * Names that leave no usable basename are refused rather than replaced with a
 * generated one: a response that cannot name its own file is malformed or
 * hostile, and inventing a name would hide that. `""`, `"."` and `".."` all
 * make an output path equal to (or escape) its own directory, which surfaces as
 * a raw `EISDIR` at write time instead of a validation error.
 *
 * @param name - The untrusted filename or relative path to reduce.
 * @param label - How the value is described in error messages.
 * @returns The validated bare basename, with surrounding whitespace trimmed.
 * @throws ValidationError if `name` yields no usable basename or is unsafe to
 *   write. Mirrors the Python SDK, which surfaces its internal
 *   `UnsafePathComponentError` to callers as a `ValidationError`.
 */
export function safeBasename(name: string, label: string = 'filename'): string {
  const rawBasename = lastSegment(name);

  // `.`, `..` and any run of dots are the cases that collapse an output path
  // onto its own directory or its parent.
  const isOnlyDots = rawBasename.length > 0 && /^\.+$/.test(rawBasename);
  if (!rawBasename || !rawBasename.trim() || isOnlyDots) {
    throw new ValidationError(
      `Path traversal detected: ${label} ${JSON.stringify(name)} leaves no usable basename to write to.`
    );
  }
  if (rawBasename.includes('\u0000')) {
    throw new ValidationError(
      `Refusing to write ${label} containing a NUL byte: ${JSON.stringify(name)}`
    );
  }
  if (CONTROL_CHARS.test(rawBasename) || WINDOWS_RESERVED_CHARS.test(rawBasename)) {
    throw new ValidationError(
      `Refusing to write ${label} containing characters reserved by Windows: ${JSON.stringify(name)}`
    );
  }
  if (rawBasename.endsWith(' ') || rawBasename.endsWith('.')) {
    throw new ValidationError(
      `Refusing to write ${label} ending in a space or dot: ${JSON.stringify(name)}`
    );
  }
  if (hasLoneSurrogate(rawBasename)) {
    throw new ValidationError(
      `Refusing to write ${label} containing invalid Unicode: ${JSON.stringify(name)}`
    );
  }

  const basename = rawBasename.trim();

  const encodedLength = new TextEncoder().encode(basename).length;
  if (encodedLength > MAX_FILENAME_BYTES) {
    throw new ValidationError(
      `Refusing to write ${label} longer than ${MAX_FILENAME_BYTES} bytes: ` +
        `${JSON.stringify(basename.slice(0, 32))}... (${encodedLength} bytes)`
    );
  }

  // Compare everything before the first dot: on Windows `NUL.tar.gz` opens the
  // null device just as `NUL` does, so extensions provide no protection.
  const deviceName = basename.split('.', 1)[0].replace(/ +$/, '').toUpperCase();
  if (WINDOWS_RESERVED_NAMES.has(deviceName)) {
    throw new ValidationError(
      `Refusing to write ${label} that is a reserved device name: ${JSON.stringify(name)}`
    );
  }

  return basename;
}
