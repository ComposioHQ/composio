import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectCliPlatform, supportsCliPlatform } from './platform';
import type {
  LocalBundledBinaryDeclaration,
  LocalBundledBinaryRef,
  LocalCliPlatform,
  LocalToolkitDeclaration,
} from './types';

const DEFAULT_BUNDLE_DIR = 'local-tools-binaries';

export interface LocalBundledBinaryResolution {
  readonly id: string;
  readonly path: string;
  readonly platform: LocalCliPlatform;
  readonly exists: boolean;
  readonly source: 'bundled' | 'fallback';
}

export const getLocalToolsBundleRootCandidates = (): ReadonlyArray<string> => {
  if (process.env.COMPOSIO_LOCAL_TOOLS_BIN_DIR?.trim()) {
    return [process.env.COMPOSIO_LOCAL_TOOLS_BIN_DIR.trim()];
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Bundled CLI JS / unpacked CLI binary sidecar location.
    path.join(moduleDir, DEFAULT_BUNDLE_DIR),
    // Package-root asset location when @composio/cli-local-tools is consumed as
    // a normal dependency and its JS lives under dist/.
    path.resolve(moduleDir, '..', DEFAULT_BUNDLE_DIR),
    // Standalone Bun executable zip/install layout: assets live next to the
    // compiled executable, not inside the virtual module directory.
    path.join(path.dirname(process.execPath), DEFAULT_BUNDLE_DIR),
  ];

  return [...new Set(candidates)];
};

export const getLocalToolsBundleRoot = (): string => {
  const candidates = getLocalToolsBundleRootCandidates();
  return candidates.find(candidate => fsSync.existsSync(candidate)) ?? candidates[0];
};

const hasPathSeparator = (value: string): boolean => value.includes('/') || value.includes('\\');

const binaryExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const findDeclaration = (
  toolkit: LocalToolkitDeclaration,
  id: string
): LocalBundledBinaryDeclaration | undefined =>
  toolkit.bundledBinaries?.find(binary => binary.id === id);

const resolveBundledPaths = (
  declaration: LocalBundledBinaryDeclaration,
  platform: LocalCliPlatform
): ReadonlyArray<string> => {
  const target = declaration.targets.find(candidate =>
    supportsCliPlatform(candidate.platforms, platform)
  );
  if (!target) return [];
  return getLocalToolsBundleRootCandidates().map(root => path.resolve(root, target.path));
};

export const resolveBundledBinary = async (
  toolkit: LocalToolkitDeclaration,
  ref: LocalBundledBinaryRef,
  options: { readonly currentPlatform?: LocalCliPlatform } = {}
): Promise<LocalBundledBinaryResolution | undefined> => {
  const currentPlatform = options.currentPlatform ?? detectCliPlatform();
  const declaration = findDeclaration(toolkit, ref.bundledBinary);
  const bundledPaths = declaration ? resolveBundledPaths(declaration, currentPlatform) : [];
  for (const bundledPath of bundledPaths) {
    if (await binaryExists(bundledPath)) {
      return {
        id: ref.bundledBinary,
        path: bundledPath,
        platform: currentPlatform,
        exists: true,
        source: 'bundled',
      };
    }
  }

  if (
    ref.fallbackCommand &&
    hasPathSeparator(ref.fallbackCommand) &&
    (await binaryExists(ref.fallbackCommand))
  ) {
    return {
      id: ref.bundledBinary,
      path: ref.fallbackCommand,
      platform: currentPlatform,
      exists: true,
      source: 'fallback',
    };
  }

  return bundledPaths[0]
    ? {
        id: ref.bundledBinary,
        path: bundledPaths[0],
        platform: currentPlatform,
        exists: false,
        source: 'bundled',
      }
    : undefined;
};

export const ensureBundledBinaryExecutable = async (filePath: string): Promise<void> => {
  if (process.platform === 'win32') return;
  const stat = await fs.stat(filePath);
  if ((stat.mode & 0o111) !== 0) return;
  await fs.chmod(filePath, stat.mode | 0o755);
};
