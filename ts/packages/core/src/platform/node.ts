import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { isFsCaseSensitive } from 'is-fs-case-sensitive';
import type { Platform, Uint8ArrayEncoding } from './types';

const findNearestExistingDirectory = (filePath: string): string => {
  let candidate = path.resolve(filePath);

  try {
    if (!fs.statSync(candidate).isDirectory()) {
      candidate = path.dirname(candidate);
    }
  } catch {
    candidate = path.dirname(candidate);
  }

  while (true) {
    try {
      if (fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      // Walk toward the filesystem root until an existing directory is found.
    }

    const parent = path.dirname(candidate);
    if (parent === candidate) {
      return candidate;
    }
    candidate = parent;
  }
};

/**
 * Node.js platform implementation.
 * Provides full file system and OS operations using Node.js built-in modules.
 */
export const platform = {
  supportsFileSystem: true,

  homedir(): string | null {
    try {
      return os.homedir();
    } catch {
      return null;
    }
  },

  joinPath(...paths: string[]): string {
    return path.join(...paths);
  },

  resolvePath(...paths: string[]): string {
    return path.resolve(...paths);
  },

  isAbsolutePath(filePath: string): boolean {
    return path.isAbsolute(filePath);
  },

  basename(filePath: string): string {
    return path.basename(filePath);
  },

  existsSync(filePath: string): boolean {
    return fs.existsSync(filePath);
  },

  realpathSync(filePath: string): string {
    return fs.realpathSync(filePath);
  },

  isFileSystemCaseSensitive(filePath: string): boolean {
    try {
      return isFsCaseSensitive(findNearestExistingDirectory(filePath));
    } catch {
      // Detection must not weaken this security guard. If the target mount
      // cannot be inspected, compare case-insensitively and accept possible
      // false positives instead of allowing a casing bypass.
      return false;
    }
  },

  mkdirSync(dirPath: string): void {
    fs.mkdirSync(dirPath, { recursive: true });
  },

  readFileSync(filePath: string, encoding?: Uint8ArrayEncoding): string | Uint8Array {
    if (encoding === undefined) {
      const buf = fs.readFileSync(filePath, { encoding: null });
      const uint8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      return uint8;
    }

    const str = fs.readFileSync(filePath, { encoding });
    return str;
  },

  writeFileSync(
    filePath: string,
    content: string | Uint8Array,
    encoding?: Uint8ArrayEncoding
  ): void {
    if (encoding && typeof content === 'string') {
      fs.writeFileSync(filePath, content, { encoding });
    } else {
      fs.writeFileSync(filePath, content);
    }
  },
} as Platform;
