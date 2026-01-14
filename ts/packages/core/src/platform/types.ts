/**
 * Platform abstraction for file system and OS operations.
 * This interface allows different implementations for Node.js and edge runtimes (e.g., Cloudflare Workers).
 */
export interface Platform {
  /**
   * Returns the user's home directory path.
   * @returns The home directory path, or null if unavailable (e.g., in edge runtimes).
   */
  homedir(): string | null;

  /**
   * Joins path segments into a single path.
   * @param paths - Path segments to join.
   * @returns The joined path.
   */
  joinPath(...paths: string[]): string;

  /**
   * Returns the last portion of a path (the filename).
   * @param filePath - The path to extract the basename from.
   * @returns The basename of the path.
   */
  basename(filePath: string): string;

  /**
   * Checks if a file or directory exists at the given path.
   * @param filePath - The path to check.
   * @returns True if the path exists, false otherwise.
   */
  existsSync(filePath: string): boolean;

  /**
   * Creates a directory at the given path, including parent directories if needed.
   * @param dirPath - The directory path to create.
   */
  mkdirSync(dirPath: string): void;

  /**
   * Reads a file synchronously and returns its contents.
   * @param filePath - The path to the file.
   * @param encoding - Optional encoding (e.g., 'utf8'). If not provided, returns a Buffer.
   * @returns The file contents as a string (if encoding provided) or Buffer.
   */
  readFileSync(filePath: string, encoding?: BufferEncoding): string | Buffer;

  /**
   * Writes content to a file synchronously.
   * @param filePath - The path to the file.
   * @param content - The content to write (string or Buffer).
   * @param encoding - Optional encoding for string content.
   */
  writeFileSync(filePath: string, content: string | Buffer, encoding?: BufferEncoding): void;

  /**
   * Indicates whether this platform supports file system operations.
   * Edge runtimes like Cloudflare Workers return false.
   */
  readonly supportsFileSystem: boolean;
}
