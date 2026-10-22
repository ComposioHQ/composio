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
 * ext4/APFS/NTFS. A longer server-supplied name is truncated to fit rather
 * than failing with a raw `ENAMETOOLONG` mid-write. Matches
 * `MAX_COMPONENT_LENGTH` in the Python SDK.
 */
export const MAX_FILENAME_BYTES = 128;

/**
 * Longest extension, in bytes and including its dot, that truncation keeps.
 * Anything longer is not a real extension and is truncated with the rest.
 */
const MAX_PRESERVED_EXTENSION_BYTES = 32;

/**
 * Reserved DOS device names. Writing to one on Windows targets the device
 * rather than a file. Prefixed on every platform so behavior does not diverge
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
const WINDOWS_INVALID_CHARS = /[\u0000-\u001f<>:"|?*]/g;

/** Windows drops trailing spaces and dots from a filename. */
const TRAILING_SPACES_AND_DOTS = /[. ]+$/;

const utf8Length = (value: string): number => new TextEncoder().encode(value).length;

const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

/**
 * 64-bit FNV-1a of the UTF-8 bytes, as 16 hex digits. Pure and synchronous, so
 * it runs on every runtime; `_fnv1a64_hex` in the Python SDK matches it.
 */
function fnv1a64Hex(value: string): string {
  let hash = FNV_OFFSET_BASIS_64;
  for (const byte of new TextEncoder().encode(value)) {
    hash = ((hash ^ BigInt(byte)) * FNV_PRIME_64) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

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

/** The longest prefix of `value`, by whole code points, that fits in `maxBytes`. */
function truncateToBytes(value: string, maxBytes: number): string {
  let truncated = '';
  let bytes = 0;
  for (const char of value) {
    bytes += utf8Length(char);
    if (bytes > maxBytes) {
      break;
    }
    truncated += char;
  }
  return truncated;
}

/** Splits off a short trailing extension (with its dot); a leading dot is not one. */
function splitExtension(name: string): [stem: string, extension: string] {
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot) : '';
  return extension && utf8Length(extension) <= MAX_PRESERVED_EXTENSION_BYTES
    ? [name.slice(0, dot), extension]
    : [name, ''];
}

/**
 * Truncates `name` to `maxBytes`, keeping a short extension so the file still
 * opens with the right application.
 */
function fitFilenameBytes(name: string, maxBytes: number = MAX_FILENAME_BYTES): string {
  if (utf8Length(name) <= maxBytes) {
    return name;
  }
  const [stem, extension] = splitExtension(name);
  return truncateToBytes(stem, maxBytes - utf8Length(extension)) + extension;
}

/** Adds a copy number before the extension without exceeding the filename byte limit. */
export function numberedBasename(name: string, copy: number): string {
  const suffix = `-${copy}`;
  const [stem, extension] = splitExtension(name);
  return (
    truncateToBytes(stem, MAX_FILENAME_BYTES - utf8Length(extension) - suffix.length) +
    suffix +
    extension
  );
}

/**
 * Tags a name that portability changed with a digest of the name it came
 * from, before the extension: `report?.png` and `report*.png` both become
 * `report_.png`, and two long names can share a truncated prefix, so without
 * the tag one download would overwrite the other in a shared directory.
 */
function tagWithOriginal(portable: string, original: string): string {
  const tag = `-${fnv1a64Hex(original)}`;
  const [stem, extension] = splitExtension(
    fitFilenameBytes(portable, MAX_FILENAME_BYTES - tag.length)
  );
  return stem + tag + extension;
}

/**
 * Collapses an untrusted filename to a bare basename that is safe to write on
 * every platform.
 *
 * Names that cannot be written at all are refused: a NUL byte, invalid
 * Unicode, or no usable basename (empty or a run of dots). A response that
 * cannot name its own file is malformed or hostile, and inventing a name would
 * hide that. `""`, `"."` and `".."` make an output path equal to, or escape,
 * its own directory, which surfaces as a raw `EISDIR` at write time instead of
 * a validation error.
 *
 * Names that are merely unportable are made portable instead, because ordinary
 * files have them (`report_2026-09-29T10:30:00.csv`, `What is this?.png`), on
 * every platform so a name does not depend on where the SDK runs:
 * control and Windows-reserved characters become `_`, names over
 * {@link MAX_FILENAME_BYTES} are truncated with their extension kept, trailing
 * spaces and dots are dropped as Windows would, and a resulting reserved
 * device name gets a `_` prefix. A name any of these rules changed is then
 * tagged with a digest of the original before its extension
 * (`report_-<16 hex>.png`) to distinguish ordinary normalization collisions;
 * a name that was already portable is returned unchanged. A result can still
 * equal a literal server name, so default saves create files exclusively.
 * `safe_basename` in
 * the Python SDK applies the same rules in the same order.
 *
 * Python-compatible stripping removes surrounding whitespace first, and the
 * usability check runs last, on the value that gets written, so neither
 * `"\u00a0.\u00a0"` nor `". ."` can be written as `.` or as its own directory.
 *
 * @param name - The untrusted filename or relative path to reduce.
 * @param label - How the value is described in error messages.
 * @returns The bare basename to write, adjusted to be portable.
 * @throws ValidationError if `name` contains a NUL byte or invalid Unicode, or
 *   leaves no usable basename.
 */
export function safeBasename(name: string, label: string = 'filename'): string {
  const basename = untrustedBasename(name).replace(SURROUNDING_WHITESPACE, '');

  if (basename.includes('\u0000')) {
    throw new ValidationError(
      `Refusing to write ${label} containing a NUL byte: ${JSON.stringify(name)}`
    );
  }
  if (hasLoneSurrogate(basename)) {
    throw new ValidationError(
      `Refusing to write ${label} containing invalid Unicode: ${JSON.stringify(name)}`
    );
  }

  const fit = (value: string): string =>
    fitFilenameBytes(value).replace(TRAILING_SPACES_AND_DOTS, '');
  let portable = fit(basename.replace(WINDOWS_INVALID_CHARS, '_'));
  // Checked on the fitted name, because truncation and trailing-dot removal
  // can expose one (`NUL` followed by spaces and a long tail). Compare
  // everything before the first dot: on Windows `NUL.tar.gz` opens the null
  // device just as `NUL` does, so extensions provide no protection. Fitting
  // again keeps the byte bound, and a `_`-prefixed name is never a device.
  const deviceName = portable.split('.', 1)[0].replace(/ +$/, '').toUpperCase();
  if (WINDOWS_RESERVED_NAMES.has(deviceName)) {
    portable = fit(`_${portable}`);
  }

  if (!portable) {
    throw new ValidationError(
      `Path traversal detected: ${label} ${JSON.stringify(name)} leaves no usable basename to write to.`
    );
  }

  return portable === basename ? portable : tagWithOriginal(portable, basename);
}
