import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import decompress from 'decompress';
import { detectCliPlatform, supportsCliPlatform } from './platform';
import type {
  LocalBundledBinaryDeclaration,
  LocalBundledBinaryRef,
  LocalCliPlatform,
  LocalToolkitDeclaration,
} from './types';

const DEFAULT_BUNDLE_DIR = 'local-tools-binaries';
const RELEASE_TAG_FILENAME = 'release-tag.txt';

const DEFAULT_GITHUB_CONFIG = {
  apiBaseUrl: 'https://api.github.com',
  owner: 'ComposioHQ',
  repo: 'composio',
} as const;

type GitHubReleaseAsset = {
  readonly name: string;
  readonly browser_download_url: string;
};

type GitHubRelease = {
  readonly tag_name: string;
  readonly assets: ReadonlyArray<GitHubReleaseAsset>;
};

let localToolsRepairPromise: Promise<boolean> | null = null;

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

const readTextFileIfPresent = async (filePath: string): Promise<string | undefined> => {
  try {
    const value = (await fs.readFile(filePath, 'utf8')).trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
};

const resolveBinaryAssetName = (): string | undefined => {
  switch (`${process.platform}-${process.arch}`) {
    case 'darwin-arm64':
      return 'composio-darwin-aarch64.zip';
    case 'darwin-x64':
      return 'composio-darwin-x64.zip';
    case 'linux-x64':
      return 'composio-linux-x64.zip';
    case 'linux-arm64':
      return 'composio-linux-aarch64.zip';
    default:
      return undefined;
  }
};

const fetchGitHubJson = async <T>({
  url,
  accessToken,
}: {
  readonly url: string;
  readonly accessToken?: string;
}): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'composio-cli-local-tools-repair',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub request failed: HTTP ${response.status}`);
  }
  return (await response.json()) as T;
};

const downloadAsset = async (
  asset: GitHubReleaseAsset,
  accessToken?: string
): Promise<Uint8Array> => {
  const response = await fetch(asset.browser_download_url, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${asset.name}: HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

const fetchChecksums = async (
  release: GitHubRelease,
  accessToken?: string
): Promise<Map<string, string> | undefined> => {
  const checksumsAsset = release.assets.find(asset => asset.name === 'checksums.txt');
  if (!checksumsAsset) return undefined;

  const response = await fetch(checksumsAsset.browser_download_url, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  if (!response.ok) return undefined;

  const checksums = new Map<string, string>();
  const text = await response.text();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      checksums.set(parts[1]!, parts[0]!);
    }
  }
  return checksums;
};

const verifyChecksum = async ({
  data,
  expectedHash,
  fileName,
}: {
  readonly data: Uint8Array;
  readonly expectedHash: string;
  readonly fileName: string;
}): Promise<void> => {
  const digest = await crypto.subtle.digest('SHA-256', data.slice().buffer);
  const actualHash = Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  if (actualHash !== expectedHash) {
    throw new Error(
      `Checksum mismatch while repairing ${fileName}\n  Expected: ${expectedHash}\n  Actual:   ${actualHash}`
    );
  }
};

const isStandaloneBunExecutable = (): boolean => {
  const currentFilePath = fileURLToPath(import.meta.url);
  return currentFilePath.startsWith('/$bunfs/');
};

const repairInstalledLocalToolsBundle = async (): Promise<boolean> => {
  if (process.env.COMPOSIO_LOCAL_TOOLS_BIN_DIR?.trim() || !isStandaloneBunExecutable()) {
    return false;
  }

  const installDirectory = path.dirname(process.execPath);
  const releaseTag =
    process.env.GITHUB_TAG?.trim() ||
    (await readTextFileIfPresent(path.join(installDirectory, RELEASE_TAG_FILENAME)));
  if (!releaseTag) return false;

  const assetName = resolveBinaryAssetName();
  if (!assetName) return false;

  const githubConfig = {
    apiBaseUrl:
      process.env.GITHUB_API_BASE_URL ||
      process.env.COMPOSIO_GITHUB_API_BASE_URL ||
      DEFAULT_GITHUB_CONFIG.apiBaseUrl,
    owner:
      process.env.GITHUB_OWNER || process.env.COMPOSIO_GITHUB_OWNER || DEFAULT_GITHUB_CONFIG.owner,
    repo: process.env.GITHUB_REPO || process.env.COMPOSIO_GITHUB_REPO || DEFAULT_GITHUB_CONFIG.repo,
    accessToken: process.env.GITHUB_ACCESS_TOKEN || process.env.COMPOSIO_GITHUB_ACCESS_TOKEN,
  };

  const release = await fetchGitHubJson<GitHubRelease>({
    url: `${githubConfig.apiBaseUrl}/repos/${githubConfig.owner}/${githubConfig.repo}/releases/tags/${encodeURIComponent(releaseTag)}`,
    accessToken: githubConfig.accessToken,
  });
  const asset = release.assets.find(candidate => candidate.name === assetName);
  if (!asset) return false;

  const archiveData = await downloadAsset(asset, githubConfig.accessToken);
  const expectedChecksum = (await fetchChecksums(release, githubConfig.accessToken))?.get(
    asset.name
  );
  if (expectedChecksum) {
    await verifyChecksum({
      data: archiveData,
      expectedHash: expectedChecksum,
      fileName: asset.name,
    });
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'composio-local-tools-repair-'));
  try {
    const zipPath = path.join(tempDir, asset.name);
    const extractDir = path.join(tempDir, 'extract');
    await fs.writeFile(zipPath, archiveData);
    await decompress(zipPath, extractDir);

    const archiveBundleRoot = path.join(
      extractDir,
      path.parse(asset.name).name,
      DEFAULT_BUNDLE_DIR
    );
    if (!(await binaryExists(archiveBundleRoot))) return false;

    const installBundleRoot = path.join(installDirectory, DEFAULT_BUNDLE_DIR);
    await fs.rm(installBundleRoot, { force: true, recursive: true });
    await fs.cp(archiveBundleRoot, installBundleRoot, { recursive: true });
    return true;
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }
};

const maybeRepairInstalledLocalToolsBundle = async (): Promise<boolean> => {
  localToolsRepairPromise ??= repairInstalledLocalToolsBundle().catch(() => false);
  return localToolsRepairPromise;
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

  if (bundledPaths.length > 0 && (await maybeRepairInstalledLocalToolsBundle())) {
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
