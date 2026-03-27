import { chmod, copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import process from 'node:process';
import decompress from 'decompress';
import { $ } from 'bun';
import { RUN_CODEX_ACP_BINARY_TARGETS } from '../src/services/run-companion-modules';

const GENERATED_ROOT_DIR = path.resolve('./.generated');
const ACP_ADAPTERS_CACHE_DIR = path.join(GENERATED_ROOT_DIR, 'acp-adapters');
const ACP_ADAPTERS_MANIFEST_PATH = path.join(GENERATED_ROOT_DIR, 'acp-adapters.manifest.json');
const REGISTRY_BASE_URL = 'https://registry.npmjs.org';
const USER_AGENT = 'composio-cli-acp-vendor/1';
const ACP_ADAPTERS_PREFIX = 'acp-adapters/';

type PackageJson = {
  readonly bin?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly version?: string;
};

type RegistryVersionManifest = {
  readonly dist?: {
    readonly tarball?: string;
  };
};

type AcpAdaptersManifest = {
  readonly claude: {
    readonly packageName: '@zed-industries/claude-code-acp';
    readonly version: string;
    readonly agentSdkVersion: string;
  };
  readonly codex: ReadonlyArray<{
    readonly packageName: string;
    readonly relativePath: string;
    readonly version: string;
  }>;
};

const require = createRequire(import.meta.url);

const fileExists = async (filePath: string): Promise<boolean> => Bun.file(filePath).exists();

const readJsonFile = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, 'utf8')) as T;

const resolvePackageJsonPath = (specifier: string): string =>
  require.resolve(`${specifier}/package.json`);

const stripAcpAdaptersPrefix = (relativePath: string): string =>
  relativePath.startsWith(ACP_ADAPTERS_PREFIX)
    ? relativePath.slice(ACP_ADAPTERS_PREFIX.length)
    : relativePath;

const readInstalledPackageJson = async (specifier: string): Promise<PackageJson> =>
  readJsonFile<PackageJson>(resolvePackageJsonPath(specifier));

const resolveClaudeAdapterEntryPath = async (): Promise<string> => {
  const manifest = await readInstalledPackageJson('@zed-industries/claude-code-acp');
  const entryPath = manifest.bin?.['claude-code-acp'];
  if (!entryPath) {
    throw new Error('Missing claude-code-acp bin entry in installed package metadata.');
  }

  return path.join(
    path.dirname(resolvePackageJsonPath('@zed-industries/claude-code-acp')),
    entryPath
  );
};

const resolveClaudeAgentSdkCliPath = (): string => {
  const claudeCodeAcpPkg = require.resolve('@zed-industries/claude-code-acp/package.json');
  const nestedRequire = createRequire(claudeCodeAcpPkg);
  const agentSdkPkg = nestedRequire.resolve('@anthropic-ai/claude-agent-sdk/package.json');
  return path.join(path.dirname(agentSdkPkg), 'cli.js');
};

const resolveClaudeAgentSdkPackageJsonPath = (): string => {
  const claudeCodeAcpPkg = require.resolve('@zed-industries/claude-code-acp/package.json');
  const nestedRequire = createRequire(claudeCodeAcpPkg);
  return nestedRequire.resolve('@anthropic-ai/claude-agent-sdk/package.json');
};

const buildCacheManifest = async (): Promise<AcpAdaptersManifest> => {
  const claudePackage = await readInstalledPackageJson('@zed-industries/claude-code-acp');
  const agentSdkPackage = await readJsonFile<PackageJson>(resolveClaudeAgentSdkPackageJsonPath());
  const codexLauncherPackage = await readInstalledPackageJson('@zed-industries/codex-acp');

  const codexTargets = RUN_CODEX_ACP_BINARY_TARGETS.map(target => {
    const version = codexLauncherPackage.optionalDependencies?.[target.packageName];
    if (!version) {
      throw new Error(
        `Missing pinned optional dependency version for ${target.packageName} in @zed-industries/codex-acp.`
      );
    }

    return {
      packageName: target.packageName,
      relativePath: target.relativePath,
      version,
    };
  });

  if (!claudePackage.version || !agentSdkPackage.version) {
    throw new Error('Missing installed claude ACP package versions.');
  }

  return {
    claude: {
      packageName: '@zed-industries/claude-code-acp',
      version: claudePackage.version,
      agentSdkVersion: agentSdkPackage.version,
    },
    codex: codexTargets,
  };
};

const readExistingManifest = async (): Promise<AcpAdaptersManifest | null> => {
  if (!(await fileExists(ACP_ADAPTERS_MANIFEST_PATH))) {
    return null;
  }

  return readJsonFile<AcpAdaptersManifest>(ACP_ADAPTERS_MANIFEST_PATH).catch(() => null);
};

const manifestPathsExist = async (manifest: AcpAdaptersManifest): Promise<boolean> => {
  const requiredPaths = [
    path.join(ACP_ADAPTERS_CACHE_DIR, 'claude-code-acp.mjs'),
    path.join(ACP_ADAPTERS_CACHE_DIR, 'cli.js'),
    ...manifest.codex.map(target =>
      path.join(ACP_ADAPTERS_CACHE_DIR, stripAcpAdaptersPrefix(target.relativePath))
    ),
  ];

  for (const requiredPath of requiredPaths) {
    if (!(await fileExists(requiredPath))) {
      return false;
    }
  }

  return true;
};

const fetchRegistryJson = async (
  packageName: string,
  version: string
): Promise<RegistryVersionManifest> => {
  const url = `${REGISTRY_BASE_URL}/${encodeURIComponent(packageName)}/${version}`;
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch registry metadata for ${packageName}@${version}: ${response.status}`
    );
  }

  return (await response.json()) as RegistryVersionManifest;
};

const downloadTarball = async (url: string, targetPath: string): Promise<void> => {
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  await writeFile(targetPath, new Uint8Array(await response.arrayBuffer()));
};

const buildClaudeAdapterBundle = async (cacheDir: string): Promise<void> => {
  const outputPath = path.join(cacheDir, 'claude-code-acp.mjs');
  const entryPath = await resolveClaudeAdapterEntryPath();
  const result =
    await $`${process.execPath} build ${entryPath} --target node --outfile ${outputPath}`.quiet();
  if (result.exitCode !== 0) {
    throw new Error('Failed to bundle claude-code-acp.mjs.');
  }

  await chmod(outputPath, 0o755);

  const cliOutputPath = path.join(cacheDir, 'cli.js');
  await copyFile(resolveClaudeAgentSdkCliPath(), cliOutputPath);
  await chmod(cliOutputPath, 0o755);
};

const extractCodexBinaryFromTarball = async ({
  binaryFileName,
  packageName,
  relativePath,
  stageCacheDir,
  stageRootDir,
  version,
}: {
  readonly binaryFileName: string;
  readonly packageName: string;
  readonly relativePath: string;
  readonly stageCacheDir: string;
  readonly stageRootDir: string;
  readonly version: string;
}): Promise<void> => {
  const metadata = await fetchRegistryJson(packageName, version);
  const tarballUrl = metadata.dist?.tarball;
  if (!tarballUrl) {
    throw new Error(
      `Registry metadata for ${packageName}@${version} did not include a tarball URL.`
    );
  }

  const tempArchivePath = path.join(
    stageRootDir,
    `${packageName.split('/')[1]?.replaceAll('/', '-') ?? 'package'}-${version}.tgz`
  );
  const tempExtractDir = path.join(
    stageRootDir,
    `${path.basename(tempArchivePath, '.tgz')}-extract`
  );

  await downloadTarball(tarballUrl, tempArchivePath);
  await mkdir(tempExtractDir, { recursive: true });
  await decompress(tempArchivePath, tempExtractDir);

  const extractedBinaryPath = path.join(tempExtractDir, 'package', 'bin', binaryFileName);
  if (!(await fileExists(extractedBinaryPath))) {
    throw new Error(
      `Codex ACP tarball for ${packageName}@${version} did not contain ${binaryFileName}.`
    );
  }

  const outputPath = path.join(stageCacheDir, stripAcpAdaptersPrefix(relativePath));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await copyFile(extractedBinaryPath, outputPath);
  await chmod(outputPath, 0o755);
};

const materializeCodexAdapters = async (
  manifest: AcpAdaptersManifest,
  stageRootDir: string,
  stageCacheDir: string
): Promise<void> => {
  await Promise.all(
    manifest.codex.map(target =>
      extractCodexBinaryFromTarball({
        binaryFileName:
          RUN_CODEX_ACP_BINARY_TARGETS.find(
            candidate => candidate.packageName === target.packageName
          )?.binaryFileName ?? 'codex-acp',
        packageName: target.packageName,
        relativePath: target.relativePath,
        stageCacheDir,
        stageRootDir,
        version: target.version,
      })
    )
  );
};

export const materializeAcpAdaptersCache = async (): Promise<string> => {
  const manifest = await buildCacheManifest();
  const existingManifest = await readExistingManifest();

  if (
    existingManifest &&
    JSON.stringify(existingManifest) === JSON.stringify(manifest) &&
    (await manifestPathsExist(manifest))
  ) {
    return ACP_ADAPTERS_CACHE_DIR;
  }

  await mkdir(GENERATED_ROOT_DIR, { recursive: true });

  const stageRootDir = await mkdtemp(path.join(GENERATED_ROOT_DIR, '.acp-adapters-'));
  const stageCacheDir = path.join(stageRootDir, 'acp-adapters');

  try {
    await mkdir(stageCacheDir, { recursive: true });
    await buildClaudeAdapterBundle(stageCacheDir);
    await materializeCodexAdapters(manifest, stageRootDir, stageCacheDir);

    await rm(ACP_ADAPTERS_CACHE_DIR, { force: true, recursive: true });
    await rename(stageCacheDir, ACP_ADAPTERS_CACHE_DIR);
    await writeFile(ACP_ADAPTERS_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  } finally {
    await rm(stageRootDir, { force: true, recursive: true });
  }

  return ACP_ADAPTERS_CACHE_DIR;
};
