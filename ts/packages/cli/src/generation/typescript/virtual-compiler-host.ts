import path from 'node:path';
import ts from 'typescript';

/**
 * Builds a virtual file map from source tuples for in-memory TypeScript compilation.
 */
export function buildVirtualFileMap(
  sources: readonly (readonly [filePath: string, content: string])[],
  target: ts.ScriptTarget
): Map<string, ts.SourceFile> {
  return new Map(
    sources.map(
      ([filename, code]) =>
        [filename, ts.createSourceFile(filename, code, target, true, ts.ScriptKind.TS)] as const
    )
  );
}

/**
 * Patches a TypeScript compiler host to resolve virtual files before
 * falling back to the default file system resolution.
 *
 * Overrides both `getSourceFile` and `fileExists` so that module resolution
 * can discover virtual files that don't exist on the real file system.
 *
 * @param fallback - `'throw'` raises when a file cannot be resolved by the
 *                   virtual file map, which keeps validation hosts isolated.
 *                   `'delegate'` falls back to the real file system without
 *                   throwing. Defaults to `'delegate'`.
 */
export function patchCompilerHostWithVirtualFiles(
  tsHost: ts.CompilerHost,
  virtualFileMap: Map<string, ts.SourceFile>,
  fallback: 'throw' | 'delegate' = 'delegate'
): void {
  const currentDirectory = normalizeSlashes(tsHost.getCurrentDirectory());
  const canonicalizePath = tsHost.getCanonicalFileName.bind(tsHost);
  const ogGetSourceFile = tsHost.getSourceFile;
  const ogFileExists = tsHost.fileExists;

  const virtualFileLookupMap = new Map<string, ts.SourceFile>();
  for (const [filename, sourceFile] of virtualFileMap) {
    for (const lookupKey of getVirtualFileLookupKeys(filename, currentDirectory)) {
      virtualFileLookupMap.set(canonicalizePath(lookupKey), sourceFile);
    }
  }

  const resolveVirtualFile = (filename: string): ts.SourceFile | undefined =>
    virtualFileLookupMap.get(canonicalizePath(normalizeSlashes(path.normalize(filename))));

  tsHost.fileExists = filename => {
    const hasVirtualFile = resolveVirtualFile(filename) !== undefined;
    if (fallback === 'throw') {
      return hasVirtualFile;
    }

    return hasVirtualFile || ogFileExists(filename);
  };

  tsHost.getSourceFile = (filename, languageVersion, onError, shouldCreateNewSourceFile) => {
    const virtualFile = resolveVirtualFile(filename);
    if (virtualFile) {
      return virtualFile;
    }

    if (fallback === 'throw') {
      throw new Error(`Unexpected filename ${filename}`);
    }

    const sourceFile = ogGetSourceFile(
      filename,
      languageVersion,
      onError,
      shouldCreateNewSourceFile
    );
    if (sourceFile) {
      return sourceFile;
    }

    return sourceFile;
  };
}

function getVirtualFileLookupKeys(filename: string, currentDirectory: string): string[] {
  const normalizedFilename = normalizeSlashes(path.normalize(filename));

  if (path.isAbsolute(normalizedFilename)) {
    const relativeFilename = normalizeSlashes(path.relative(currentDirectory, normalizedFilename));
    return uniqueLookupKeys(normalizedFilename, relativeFilename, `./${relativeFilename}`);
  }

  const relativeFilename = normalizedFilename.replace(/^\.\//, '');
  return uniqueLookupKeys(
    normalizedFilename,
    relativeFilename,
    `./${relativeFilename}`,
    normalizeSlashes(path.resolve(currentDirectory, relativeFilename))
  );
}

function normalizeSlashes(filename: string): string {
  return filename.replaceAll('\\', '/');
}

function uniqueLookupKeys(...keys: string[]): string[] {
  return Array.from(new Set(keys.filter(key => key.length > 0)));
}

/**
 * Formats a TypeScript diagnostic into a human-readable string.
 */
export function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  if (diagnostic.file && diagnostic.start !== undefined) {
    const { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    return `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`;
  }
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
}
