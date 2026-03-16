import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Platform, Uint8ArrayEncoding } from './types';

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

  basename(filePath: string): string {
    return path.basename(filePath);
  },

  existsSync(filePath: string): boolean {
    return fs.existsSync(filePath);
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
