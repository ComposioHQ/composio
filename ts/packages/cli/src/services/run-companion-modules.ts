import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import decompress from 'decompress';

export const RUN_COMPANION_MODULE_BASENAMES = [
  'run-subagent-shared',
  'run-subagent-acp',
  'run-subagent-legacy',
] as const;

export const RUN_COMPANION_MODULE_FILENAMES = RUN_COMPANION_MODULE_BASENAMES.map(
  name => `${name}.mjs`
);

export const RUN_COMPANION_RELEASE_TAG_FILENAME = 'release-tag.txt';

type GitHubReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type GitHubRelease = {
  tag_name: string;
  assets: GitHubReleaseAsset[];
};

const DEFAULT_GITHUB_CONFIG = {
  apiBaseUrl: 'https://api.github.com',
  owner: 'ComposioHQ',
  repo: 'composio',
} as const;

const resolveCompanionInstallDirectory = (execPath: string) => path.dirname(execPath);

const resolveBinaryAssetName = ({
  platform = process.platform,
  arch = process.arch,
}: {
  platform?: NodeJS.Platform;
  arch?: string;
}) => {
  switch (`${platform}-${arch}`) {
    case 'darwin-arm64':
      return 'composio-darwin-aarch64.zip';
    case 'darwin-x64':
      return 'composio-darwin-x64.zip';
    case 'linux-x64':
      return 'composio-linux-x64.zip';
    case 'linux-arm64':
      return 'composio-linux-aarch64.zip';
    default:
      throw new Error(`Unsupported platform for run companion repair: ${platform}-${arch}`);
  }
};

const readTextFileIfPresent = (filePath: string) => {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  const value = fs.readFileSync(filePath, 'utf8').trim();
  return value.length > 0 ? value : undefined;
};

export const readInstalledReleaseTag = (execPath: string) =>
  readTextFileIfPresent(
    path.join(resolveCompanionInstallDirectory(execPath), RUN_COMPANION_RELEASE_TAG_FILENAME)
  );

export const writeInstalledReleaseTag = (installDir: string, releaseTag: string) => {
  fs.writeFileSync(
    path.join(installDir, RUN_COMPANION_RELEASE_TAG_FILENAME),
    `${releaseTag}\n`,
    'utf8'
  );
};

export const listMissingInstalledRunCompanionModules = (execPath: string) => {
  const installDirectory = resolveCompanionInstallDirectory(execPath);
  return RUN_COMPANION_MODULE_FILENAMES.filter(
    fileName => !fs.existsSync(path.join(installDirectory, fileName))
  );
};

const fetchGitHubJson = async <T>({
  url,
  accessToken,
  fetchErrorMessage,
}: {
  url: string;
  accessToken?: string;
  fetchErrorMessage: string;
}): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'composio-cli-run-repair',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${fetchErrorMessage} (HTTP ${response.status}${body ? `: ${body}` : ''})`);
  }

  return (await response.json()) as T;
};

const fetchChecksums = async ({
  release,
  accessToken,
}: {
  release: GitHubRelease;
  accessToken?: string;
}) => {
  const checksumsAsset = release.assets.find(asset => asset.name === 'checksums.txt');
  if (!checksumsAsset) {
    return undefined;
  }

  const response = await fetch(checksumsAsset.browser_download_url, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (!response.ok) {
    return undefined;
  }

  const text = await response.text();
  const checksums = new Map<string, string>();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

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
  data: Uint8Array;
  expectedHash: string;
  fileName: string;
}) => {
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

const resolveRepairReleaseTag = ({
  execPath,
  appVersion,
}: {
  execPath: string;
  appVersion: string;
}) =>
  process.env.GITHUB_TAG?.trim() ||
  readInstalledReleaseTag(execPath) ||
  `@composio/cli@${appVersion}`;

export const repairMissingInstalledRunCompanionModules = async ({
  callerImportMetaUrl,
  execPath,
  appVersion,
}: {
  callerImportMetaUrl: string;
  execPath: string;
  appVersion: string;
}) => {
  const currentFilePath = fileURLToPath(callerImportMetaUrl);
  if (!currentFilePath.startsWith('/$bunfs/')) {
    return { repaired: false as const };
  }

  const missingModules = listMissingInstalledRunCompanionModules(execPath);
  if (missingModules.length === 0) {
    return { repaired: false as const };
  }

  const releaseTag = resolveRepairReleaseTag({ execPath, appVersion });
  const githubConfig = {
    apiBaseUrl: process.env.GITHUB_API_BASE_URL || DEFAULT_GITHUB_CONFIG.apiBaseUrl,
    owner: process.env.GITHUB_OWNER || DEFAULT_GITHUB_CONFIG.owner,
    repo: process.env.GITHUB_REPO || DEFAULT_GITHUB_CONFIG.repo,
    accessToken: process.env.GITHUB_ACCESS_TOKEN,
  };

  const encodedTag = encodeURIComponent(releaseTag);
  const release = await fetchGitHubJson<GitHubRelease>({
    url: `${githubConfig.apiBaseUrl}/repos/${githubConfig.owner}/${githubConfig.repo}/releases/tags/${encodedTag}`,
    accessToken: githubConfig.accessToken,
    fetchErrorMessage: `Failed to fetch release metadata for ${releaseTag} while repairing run companion modules`,
  }).catch(error => {
    throw new Error(
      [
        `Unable to restore the files required by 'composio run' for ${releaseTag}.`,
        error instanceof Error ? error.message : String(error),
        `Reinstall the CLI, or set GITHUB_TAG to the exact release tag for this build and try again.`,
      ].join('\n')
    );
  });

  const assetName = resolveBinaryAssetName({});
  const asset = release.assets.find(candidate => candidate.name === assetName);
  if (!asset) {
    throw new Error(
      `Release ${release.tag_name} does not contain ${assetName}; cannot restore run companion modules.`
    );
  }

  const archiveResponse = await fetch(asset.browser_download_url, {
    headers: githubConfig.accessToken
      ? { Authorization: `Bearer ${githubConfig.accessToken}` }
      : undefined,
  });
  if (!archiveResponse.ok) {
    throw new Error(
      `Failed to download ${asset.name} from ${release.tag_name} while repairing run companion modules (HTTP ${archiveResponse.status}).`
    );
  }

  const archiveData = new Uint8Array(await archiveResponse.arrayBuffer());
  const checksums = await fetchChecksums({
    release,
    accessToken: githubConfig.accessToken,
  });
  const expectedChecksum = checksums?.get(asset.name);
  if (expectedChecksum) {
    await verifyChecksum({
      data: archiveData,
      expectedHash: expectedChecksum,
      fileName: asset.name,
    });
  }

  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'composio-run-repair-'));
  try {
    const archivePath = path.join(tempDirectory, asset.name);
    const extractDirectory = path.join(tempDirectory, 'extract');
    const packageDirectory = path.join(extractDirectory, path.parse(asset.name).name);
    fs.writeFileSync(archivePath, archiveData);
    fs.mkdirSync(extractDirectory, { recursive: true });
    await decompress(archivePath, extractDirectory);

    const installDirectory = resolveCompanionInstallDirectory(execPath);
    for (const fileName of RUN_COMPANION_MODULE_FILENAMES) {
      const sourcePath = path.join(packageDirectory, fileName);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(
          `Release ${release.tag_name} is missing ${fileName}; cannot restore the files required by 'composio run'.`
        );
      }

      fs.copyFileSync(sourcePath, path.join(installDirectory, fileName));
    }

    writeInstalledReleaseTag(installDirectory, release.tag_name);
    return {
      repaired: true as const,
      releaseTag: release.tag_name,
    };
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
};

export const resolveRunCompanionModulePath = ({
  callerImportMetaUrl,
  execPath,
  relativeNoExtensionFromCaller,
}: {
  callerImportMetaUrl: string;
  execPath: string;
  relativeNoExtensionFromCaller: string;
}): string => {
  const currentFilePath = fileURLToPath(callerImportMetaUrl);
  const currentDirectory = path.dirname(currentFilePath);
  const executableDirectory = path.dirname(execPath);
  const baseName = path.basename(relativeNoExtensionFromCaller);

  const candidates = [
    path.resolve(currentDirectory, `${relativeNoExtensionFromCaller}.ts`),
    path.resolve(currentDirectory, `${relativeNoExtensionFromCaller}.js`),
    path.resolve(currentDirectory, 'services', `${baseName}.mjs`),
    path.resolve(currentDirectory, 'services', `${baseName}.js`),
    path.resolve(currentDirectory, `${baseName}.mjs`),
    path.resolve(currentDirectory, `${baseName}.js`),
    path.resolve(executableDirectory, `${baseName}.mjs`),
    path.resolve(executableDirectory, `${baseName}.js`),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return currentFilePath.startsWith('/$bunfs/')
    ? path.resolve(executableDirectory, `${baseName}.mjs`)
    : path.resolve(currentDirectory, `${baseName}.mjs`);
};
