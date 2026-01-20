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

  readFileSync(filePath: string, encoding?: BufferEncoding): string | Uint8Array {
    if (encoding) {
      return fs.readFileSync(filePath, encoding);
    }
    // Convert Buffer to Uint8Array for cross-platform compatibility
    const buffer = fs.readFileSync(filePath);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  },

  writeFileSync(filePath: string, content: string | Uint8Array, encoding?: BufferEncoding): void {
    if (encoding && typeof content === 'string') {
      fs.writeFileSync(filePath, content, encoding);
    } else if (content instanceof Uint8Array) {
      fs.writeFileSync(filePath, Buffer.from(content));
    } else {
      fs.writeFileSync(filePath, content);
    }
  },
};
