/**
 * Filename containment for untrusted input.
 *
 * Every field of an API response is untrusted, including filenames. When such a
 * value becomes part of a filesystem path it must pass through this module
 * first, and validation must happen before any `mkdir` or write so a rejected
 * value leaves nothing behind on disk.
 *
 * TypeScript counterpart of `safe_basename` in `python/composio/utils/safe_path.py`.
 * The two use the same validation order and whitespace rules. Path extraction
 * is intentionally limited here; see `untrustedBasename`.
 *
 * Pure string logic with no filesystem access: no static `node:*` imports, so
 * it is usable from edge/workerd builds.
 */
import { ValidationError } from '../errors/ValidationErrors';

/**
 * Upper bound on a filename, well under the 255-byte limit common to
 * ext4/APFS/NTFS. Keeps a long server-supplied name from failing with a raw
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

/** Control characters and characters reserved by Windows. */
const WINDOWS_INVALID_CHARS = /[\u0000-\u001f<>:"|?*]/;

/**
 * Python str.strip() whitespace: Unicode White_Space plus U+001C–U+001F.
 * Unlike JavaScript trim(), this includes U+0085 and preserves U+FEFF.
 */
const PYTHON_WHITESPACE =
  '[\\u0009-\\u000d\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]';
const SURROUNDING_WHITESPACE = new RegExp(`^${PYTHON_WHITESPACE}+|${PYTHON_WHITESPACE}+$`, 'g');

/**
 * Returns the last path segment of `value`, treating both `/` and `\` as
 * separators, or `''` when there is none.
 *
 * `path.basename()` on POSIX only splits on `/`, so a name crafted for a
 * Windows target (`..\..\evil`) comes back intact on macOS and Linux. Splitting
 * on both and removing an initial drive prefix also handles `C:report.txt`.
 * This is not a full `PureWindowsPath` parser: dot components stay literal,
 * and UNC anchors are not interpreted.
 *
 * Never throws: this is a display value as well as the input to
 * {@link safeBasename}, and it is read while constructing download errors.
 */
export function untrustedBasename(value: string): string {
  const segments = value.replace(/^[a-z]:/i, '').split(/[/\\]+/);
  // Trailing separators name the same file: `a/b/` and `a/b` both basename to `b`.
  while (segments.length > 0 && segments[segments.length - 1] === '') {
    segments.pop();
  }
  return segments[segments.length - 1] ?? '';
}

/**
 * True when `value` contains a surrogate code unit that is not part of a valid
 * pair. Such a string cannot be encoded as UTF-8; `TextEncoder` silently
 * substitutes U+FFFD, which would write a file under a name the response never
 * specified. `String.prototype.isWellFormed()` is ES2024 and this package
 * targets es2022, hence the manual scan.
 */
function hasLoneSurrogate(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true;
      }
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

/**
 * Collapses an untrusted filename to a bare, writable basename.
 *
 * Applies, in order: no usable basename (empty or a run of dots once
 * surrounding whitespace is stripped), NUL bytes, control and Windows-reserved
 * characters, trailing space or dot, invalid Unicode, a byte-length bound, and
 * reserved device names. This is the order `safe_basename` uses in the Python
 * SDK. This implementation rejects lone surrogates rather than relying on
 * Python filesystem encoding behavior.
 *
 * Names that leave no usable basename are refused rather than replaced with a
 * generated one: a response that cannot name its own file is malformed or
 * hostile, and inventing a name would hide that. `""`, `"."` and `".."` make
 * an output path equal to, or escape, its own directory, which surfaces as a
 * raw `EISDIR` at write time instead of a validation error.
 *
 * The usability check runs on the *trimmed* basename because that is what gets
 * written: Python-compatible stripping removes whitespace, so `"\u00a0.\u00a0"` would
 * otherwise pass a check on the raw segment and then be written as `"."`. The
 * hazard checks that follow run on the raw segment so a trailing ASCII space or
 * dot is refused, not trimmed away. Check the stripped value for trailing dots
 * too, since stripping whitespace can expose one.
 *
 * @param name - The untrusted filename or relative path to reduce.
 * @param label - How the value is described in error messages.
 * @returns The validated bare basename, with surrounding whitespace trimmed.
 * @throws ValidationError if `name` yields no usable basename or is unsafe to write.
 */
export function safeBasename(name: string, label: string = 'filename'): string {
  const rawBasename = untrustedBasename(name);
  const basename = rawBasename.replace(SURROUNDING_WHITESPACE, '');

  if (!basename || /^\.+$/.test(basename)) {
    throw new ValidationError(
      `Path traversal detected: ${label} ${JSON.stringify(name)} leaves no usable basename to write to.`
    );
  }
  if (rawBasename.includes('\u0000')) {
    throw new ValidationError(
      `Refusing to write ${label} containing a NUL byte: ${JSON.stringify(name)}`
    );
  }
  if (WINDOWS_INVALID_CHARS.test(rawBasename)) {
    throw new ValidationError(
      `Refusing to write ${label} containing characters reserved by Windows: ${JSON.stringify(name)}`
    );
  }
  if (rawBasename.endsWith(' ') || rawBasename.endsWith('.') || basename.endsWith('.')) {
    throw new ValidationError(
      `Refusing to write ${label} ending in a space or dot: ${JSON.stringify(name)}`
    );
  }
  if (hasLoneSurrogate(basename)) {
    throw new ValidationError(
      `Refusing to write ${label} containing invalid Unicode: ${JSON.stringify(name)}`
    );
  }

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
