import fs from 'node:fs/promises';
import path from 'node:path';

const swiftSystemAtResolveBeneathGuard = '#if canImport(Darwin, _version: 346) || os(FreeBSD)';
const swiftSystemFreeBsdOnlyGuard = '#if os(FreeBSD)';

// swift-system 1.7.x exposes AT_RESOLVE_BENEATH on Darwin when compiling with
// Swift 6.2, but GitHub's macOS SDK currently omits the C constant.
const swiftSystemAtResolveBeneathFiles = [
  'Sources/System/Internals/Constants.swift',
  'Sources/System/FileSystem/Stat.swift',
] as const;

const countOccurrences = (source: string, pattern: string): number =>
  source.split(pattern).length - 1;

export const patchSwiftSystemAtResolveBeneathGuardInSource = (
  source: string,
  filePath: string
): { source: string; replacementCount: number } => {
  const replacementCount = countOccurrences(source, swiftSystemAtResolveBeneathGuard);
  if (replacementCount > 0) {
    return {
      source: source.replaceAll(swiftSystemAtResolveBeneathGuard, swiftSystemFreeBsdOnlyGuard),
      replacementCount,
    };
  }

  if (source.includes(swiftSystemFreeBsdOnlyGuard) && source.includes('AT_RESOLVE_BENEATH')) {
    return { source, replacementCount: 0 };
  }

  throw new Error(`Unable to patch swift-system AT_RESOLVE_BENEATH guard in ${filePath}`);
};

export const patchSwiftSystemAtResolveBeneathGuard = async (
  checkoutRoot: string,
  exists: (filePath: string) => Promise<boolean>
): Promise<number> => {
  let replacementCount = 0;

  for (const filePath of swiftSystemAtResolveBeneathFiles) {
    const sourcePath = path.join(checkoutRoot, filePath);
    if (!(await exists(sourcePath))) {
      throw new Error(
        `Swift package resolution completed but swift-system ${filePath} was not found.`
      );
    }

    const source = await fs.readFile(sourcePath, 'utf8');
    const patched = patchSwiftSystemAtResolveBeneathGuardInSource(source, filePath);
    if (patched.replacementCount === 0) continue;

    await fs.chmod(sourcePath, 0o644).catch(() => undefined);
    await fs.writeFile(sourcePath, patched.source, 'utf8');
    replacementCount += patched.replacementCount;
  }

  return replacementCount;
};
