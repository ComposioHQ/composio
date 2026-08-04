import type { Platform, Uint8ArrayEncoding } from './types';

const SLASH_CHAR_CODE = 47; // '/'

/**
 * Trailing-slash trim without a regex. The equivalent pattern backtracks
 * quadratically on long runs of slashes (CodeQL js/polynomial-redos), so this
 * walks the string from the end instead. Returns the input unchanged when
 * there is nothing to trim, so the common case allocates nothing.
 */
const trimTrailingSlashes = (value: string): string => {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === SLASH_CHAR_CODE) end--;
  return end === value.length ? value : value.slice(0, end);
};

/**
 * Leading-and-trailing slash trim without a regex, matching the semantics of
 * the previous leading/trailing slash-trim replace for every input, including
 * a string that is entirely slashes.
 */
const trimSurroundingSlashes = (value: string): string => {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) === SLASH_CHAR_CODE) start++;
  while (end > start && value.charCodeAt(end - 1) === SLASH_CHAR_CODE) end--;
  return start === 0 && end === value.length ? value : value.slice(start, end);
};

/**
 * Cloudflare Workers / Edge runtime platform implementation.
 * Provides stub implementations for file system operations that are unavailable in edge runtimes.
 * All file system operations gracefully return null/empty values or throw descriptive errors.
 */
export const platform: Platform = {
  supportsFileSystem: false,

  homedir(): string | null {
    // Home directory is not available in edge runtimes
    return null;
  },

  joinPath(...paths: string[]): string {
    // Simple path joining without Node.js path module
    return paths
      .map((segment, index) => {
        if (index === 0) {
          return trimTrailingSlashes(segment);
        }
        return trimSurroundingSlashes(segment);
      })
      .filter(Boolean)
      .join('/');
  },

  resolvePath(...paths: string[]): string {
    // No working directory in edge runtimes. Best-effort: join the segments
    // and return the result. Callers that need a real `path.resolve` should
    // gate on `supportsFileSystem`.
    return this.joinPath(...paths);
  },

  isAbsolutePath(filePath: string): boolean {
    // POSIX-only check; edge runtimes don't have Windows-style drive letters.
    return filePath.startsWith('/');
  },

  basename(filePath: string): string {
    // Simple basename extraction without Node.js path module
    const segments = trimTrailingSlashes(filePath).split('/');
    return segments[segments.length - 1] || '';
  },

  existsSync(_filePath: string): boolean {
    // File system is not available in edge runtimes
    return false;
  },

  realpathSync(filePath: string): string {
    // No filesystem in edge runtimes: cannot resolve symlinks, so return the
    // input unchanged. Local-path uploads don't happen on workerd anyway.
    return filePath;
  },

  isFileSystemCaseSensitive(_filePath: string): boolean {
    // Preserve exact matching when there is no filesystem to inspect.
    return true;
  },

  mkdirSync(_dirPath: string): void {
    // No-op in edge runtimes - directories cannot be created
  },

  readFileSync(_filePath: string, _encoding?: Uint8ArrayEncoding): never {
    throw new Error(
      'File system operations are not supported in this runtime environment (Cloudflare Workers/Edge). ' +
        'Use environment variables or external storage services instead.'
    );
  },

  writeFileSync(
    _filePath: string,
    _content: string | Uint8Array,
    _encoding?: Uint8ArrayEncoding
  ): never {
    throw new Error(
      'File system operations are not supported in this runtime environment (Cloudflare Workers/Edge). ' +
        'Use environment variables or external storage services instead.'
    );
  },
};
