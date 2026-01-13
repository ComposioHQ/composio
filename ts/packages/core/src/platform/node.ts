import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Platform } from './types';

/**
 * Node.js platform implementation.
 * Provides full file system and OS operations using Node.js built-in modules.
 */
export const platform: Platform = {
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

  readFileSync(filePath: string, encoding?: BufferEncoding): string | Buffer {
    if (encoding) {
      return fs.readFileSync(filePath, encoding);
    }
    return fs.readFileSync(filePath);
  },

  writeFileSync(filePath: string, content: string | Buffer, encoding?: BufferEncoding): void {
    if (encoding && typeof content === 'string') {
      fs.writeFileSync(filePath, content, encoding);
    } else {
      fs.writeFileSync(filePath, content);
    }
  },
};
