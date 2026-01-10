import type { Platform } from './types';

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
          return segment.replace(/\/+$/, '');
        }
        return segment.replace(/^\/+|\/+$/g, '');
      })
      .filter(Boolean)
      .join('/');
  },

  basename(filePath: string): string {
    // Simple basename extraction without Node.js path module
    const segments = filePath.replace(/\/+$/, '').split('/');
    return segments[segments.length - 1] || '';
  },

  existsSync(_filePath: string): boolean {
    // File system is not available in edge runtimes
    return false;
  },

  mkdirSync(_dirPath: string): void {
    // No-op in edge runtimes - directories cannot be created
  },

  readFileSync(_filePath: string, _encoding?: BufferEncoding): never {
    throw new Error(
      'File system operations are not supported in this runtime environment (Cloudflare Workers/Edge). ' +
        'Use environment variables or external storage services instead.'
    );
  },

  writeFileSync(_filePath: string, _content: string | Buffer, _encoding?: BufferEncoding): never {
    throw new Error(
      'File system operations are not supported in this runtime environment (Cloudflare Workers/Edge). ' +
        'Use environment variables or external storage services instead.'
    );
  },
};
