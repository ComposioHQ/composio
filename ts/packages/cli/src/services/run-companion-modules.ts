// Companion-module asset resolution and self-repair helpers shared by the CLI runtime,
// the bundled `composio run` companion modules, and the binary build scripts. Every
// helper is an Effect over the @effect/platform FileSystem/Path services; consumers
// outside the CLI runtime (companion runtimes, scripts) provide their own platform layers.
import { FileSystem, Path } from '@effect/platform';
import type { PlatformError } from '@effect/platform/Error';
import { Config, ConfigProvider, Data, Effect, Option, Schema } from 'effect';
import { extractZipSafely } from 'src/utils/extract-zip-safely';
import { IS_RELEASE_BUILD } from 'src/constants';
import { GitHubRelease } from 'src/effects/resolve-cli-release';
import { BaseConfigProviderLive, extendConfigProvider } from 'src/services/config';
import { NodeOs } from 'src/services/node-os';
import { atomicReplaceFile } from 'src/utils/atomic-replace';
import { parseChecksumsText, sha256Hex } from 'src/utils/checksums';
import { CLI_RELEASE_TAG_PREFIX } from 'src/utils/cli-release-version';

export const RUN_COMPANION_MODULE_BASENAMES: ReadonlyArray<string> = [
  'run-helpers-runtime',
  'run-subagent-shared',
  'run-subagent-acp',
  'run-subagent-legacy',
  'run-subagent-output-mcp',
];

export const RUN_COMPANION_MODULE_FILENAMES = RUN_COMPANION_MODULE_BASENAMES.map(
  name => `${name}.mjs`
);

export const RUN_COMPANION_RELEASE_TAG_FILENAME = 'release-tag.txt';
export type RunCodexAcpBinaryTarget = {
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly packageName: string;
  readonly binaryFileName: string;
  readonly relativePath: string;
};

export const RUN_CODEX_ACP_BINARY_TARGETS: ReadonlyArray<RunCodexAcpBinaryTarget> = [
  {
    platform: 'darwin',
    arch: 'arm64',
    packageName: '@zed-industries/codex-acp-darwin-arm64',
    binaryFileName: 'codex-acp',
    relativePath: 'acp-adapters/codex/darwin-arm64/codex-acp',
  },
  {
    platform: 'darwin',
    arch: 'x64',
    packageName: '@zed-industries/codex-acp-darwin-x64',
    binaryFileName: 'codex-acp',
    relativePath: 'acp-adapters/codex/darwin-x64/codex-acp',
  },
  {
    platform: 'linux',
    arch: 'arm64',
    packageName: '@zed-industries/codex-acp-linux-arm64',
    binaryFileName: 'codex-acp',
    relativePath: 'acp-adapters/codex/linux-arm64/codex-acp',
  },
  {
    platform: 'linux',
    arch: 'x64',
    packageName: '@zed-industries/codex-acp-linux-x64',
    binaryFileName: 'codex-acp',
    relativePath: 'acp-adapters/codex/linux-x64/codex-acp',
  },
];
export const codexAcpBinaryTargetFor = ({
  platform,
  arch,
}: {
  readonly platform: string;
  readonly arch: string;
}): RunCodexAcpBinaryTarget | undefined =>
  RUN_CODEX_ACP_BINARY_TARGETS.find(target => target.platform === platform && target.arch === arch);

// Portable ACP assets: any install that invokes an ACP sub-agent needs these
// regardless of platform/arch. They belong to the lazy tier — see
// `listMissingInstalledRunCompanionModules` for the two-tier split.
export const RUN_COMPANION_SHARED_STATIC_ASSET_RELATIVE_PATHS: ReadonlyArray<string> = [
  'acp-adapters/claude-code-acp.mjs',
  // cli.js from @anthropic-ai/claude-agent-sdk must live next to claude-code-acp.mjs.
  // The bundled adapter uses import.meta.url to locate it at runtime.
  'acp-adapters/cli.js',
];

// Every asset a release archive ships, across all supported platforms. Only the
// packaging step cares about this: a single machine can execute exactly one of
// the codex-acp binaries.
export const RUN_COMPANION_ALL_STATIC_ASSET_RELATIVE_PATHS: ReadonlyArray<string> = [
  ...RUN_COMPANION_SHARED_STATIC_ASSET_RELATIVE_PATHS,
  ...RUN_CODEX_ACP_BINARY_TARGETS.map(target => target.relativePath),
];

/**
 * ACP assets an install must contain to be complete on the given platform/arch:
 * the portable ones plus at most the single codex-acp binary this host can run.
 * Unsupported platform/arch pairs simply have no codex-acp requirement.
 *
 * These are the *lazy* tier: `composio run` only needs them when the script it
 * runs actually invokes an ACP sub-agent, so startup never demands them.
 */
export const runCompanionStaticAssetRelativePathsFor = ({
  platform,
  arch,
}: {
  readonly platform: string;
  readonly arch: string;
}): ReadonlyArray<string> => {
  const hostTarget = codexAcpBinaryTargetFor({ platform, arch });

  return hostTarget
    ? [...RUN_COMPANION_SHARED_STATIC_ASSET_RELATIVE_PATHS, hostTarget.relativePath]
    : RUN_COMPANION_SHARED_STATIC_ASSET_RELATIVE_PATHS;
};

// NodeOs is the sanctioned platform/arch boundary; self-provided so callers keep
// their existing FileSystem/Path-only requirements.
export const hostRunCompanionStaticAssetRelativePaths: Effect.Effect<ReadonlyArray<string>> =
  Effect.map(NodeOs, os =>
    runCompanionStaticAssetRelativePathsFor({ platform: os.platform, arch: os.arch })
  ).pipe(Effect.provide(NodeOs.Default));

export class RunCompanionRepairError extends Data.TaggedError('services/RunCompanionRepairError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const relativeImportPattern =
  /(?:import\s+(?:[^'"]+?\s+from\s+)?|export\s+(?:\*\s+from\s+|\{[^}]+\}\s+from\s+)|import\s*\()\s*["'](\.{1,2}\/[^"']+?\.mjs)["']/g;

const isImportGraphFile = (relativePath: string) => /\.(?:m?js|ts)$/.test(relativePath);

const fileExists = (fs: FileSystem.FileSystem, filePath: string) =>
  fs.exists(filePath).pipe(Effect.orElseSucceed(() => false));

const filePathFromUrl = (path: Path.Path, url: string): Effect.Effect<string> =>
  Schema.decodeUnknown(Schema.URL)(url).pipe(Effect.flatMap(path.fromFileUrl), Effect.orDie);

const collectRelativeImportPaths = ({
  fs,
  path,
  rootDir,
  relativePath,
  collected,
  recordMissingPaths = false,
}: {
  fs: FileSystem.FileSystem;
  path: Path.Path;
  rootDir: string;
  relativePath: string;
  collected: Set<string>;
  recordMissingPaths?: boolean;
}): Effect.Effect<void> =>
  Effect.gen(function* () {
    const normalizedRelativePath = relativePath.replaceAll(path.sep, '/');
    if (collected.has(normalizedRelativePath)) {
      return;
    }

    const absolutePath = path.join(rootDir, normalizedRelativePath);
    const exists = yield* fileExists(fs, absolutePath);
    if (!exists && !recordMissingPaths) {
      return;
    }

    collected.add(normalizedRelativePath);
    if (!exists) {
      return;
    }

    if (!isImportGraphFile(normalizedRelativePath)) {
      return;
    }

    const source = yield* Effect.orDie(fs.readFileString(absolutePath, 'utf8'));
    for (const match of source.matchAll(relativeImportPattern)) {
      const specifier = match[1];
      if (!specifier) {
        continue;
      }

      const dependencyRelativePath = path
        .relative(rootDir, path.resolve(path.dirname(absolutePath), specifier))
        .replaceAll(path.sep, '/');

      yield* collectRelativeImportPaths({
        fs,
        path,
        rootDir,
        relativePath: dependencyRelativePath,
        collected,
        recordMissingPaths,
      });
    }
  });

export const collectRunCompanionAssetRelativePaths = (
  rootDir: string
): Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const collected = new Set<string>();

    for (const fileName of RUN_COMPANION_MODULE_FILENAMES) {
      yield* collectRelativeImportPaths({
        fs,
        path,
        rootDir,
        relativePath: fileName,
        collected,
      });
    }

    if (collected.size === 0) {
      for (const baseName of RUN_COMPANION_MODULE_BASENAMES) {
        yield* collectRelativeImportPaths({
          fs,
          path,
          rootDir,
          relativePath: `services/${baseName}.mjs`,
          collected,
        });
      }
    }

    for (const relativePath of yield* hostRunCompanionStaticAssetRelativePaths) {
      yield* collectRelativeImportPaths({
        fs,
        path,
        rootDir,
        relativePath,
        collected,
      });
    }

    return [...collected].sort();
  });

/**
 * A release archive names every codex-acp path but fills only the one its own
 * platform can execute; the rest are empty placeholders that keep older clients'
 * upgrade verification passing. `requireNonEmpty` makes a placeholder resolve as
 * absent so the caller falls through to its next adapter source.
 */
const fileHasContent = (fs: FileSystem.FileSystem, filePath: string) =>
  fs.stat(filePath).pipe(
    Effect.map(info => Number(info.size) > 0),
    Effect.orElseSucceed(() => false)
  );

export const resolveRunCompanionAssetPath = ({
  callerImportMetaUrl,
  execPath,
  relativePathFromRoot,
  requireNonEmpty = false,
}: {
  callerImportMetaUrl: string;
  execPath: string;
  relativePathFromRoot: string;
  requireNonEmpty?: boolean;
}): Effect.Effect<string | null, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const currentFilePath = yield* filePathFromUrl(path, callerImportMetaUrl);
    const currentDirectory = path.dirname(currentFilePath);
    const executableDirectory = path.dirname(execPath);

    const candidates = [
      path.resolve(currentDirectory, relativePathFromRoot),
      path.resolve(currentDirectory, '..', relativePathFromRoot),
      path.resolve(executableDirectory, relativePathFromRoot),
    ];

    const isUsable = requireNonEmpty ? fileHasContent : fileExists;
    const found = yield* Effect.findFirst(candidates, candidate => isUsable(fs, candidate));
    return Option.getOrNull(found);
  });

/**
 * Relative paths an install rooted at `rootDir` is expected to contain.
 *
 * `staticAssetRelativePaths` defaults to the host's requirement set, so a
 * missing codex-acp binary for a foreign platform never counts as a broken
 * install. Release packaging passes `RUN_COMPANION_ALL_STATIC_ASSET_RELATIVE_PATHS`
 * because one packaging host builds archives for every platform.
 */
export const collectExpectedRunCompanionAssetRelativePaths = (
  rootDir: string,
  options: { readonly staticAssetRelativePaths?: ReadonlyArray<string> } = {}
): Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const collected = new Set<string>();
    const staticAssetRelativePaths =
      options.staticAssetRelativePaths ?? (yield* hostRunCompanionStaticAssetRelativePaths);

    for (const fileName of RUN_COMPANION_MODULE_FILENAMES) {
      yield* collectRelativeImportPaths({
        fs,
        path,
        rootDir,
        relativePath: fileName,
        collected,
        recordMissingPaths: true,
      });
    }

    for (const relativePath of staticAssetRelativePaths) {
      yield* collectRelativeImportPaths({
        fs,
        path,
        rootDir,
        relativePath,
        collected,
        recordMissingPaths: true,
      });
    }

    return [...collected].sort();
  });

const DEFAULT_GITHUB_CONFIG = {
  apiBaseUrl: 'https://api.github.com',
  owner: 'ComposioHQ',
  repo: 'composio',
};

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
      return undefined;
  }
};

const readTextFileIfPresent = (fs: FileSystem.FileSystem, filePath: string) =>
  Effect.gen(function* () {
    const exists = yield* fileExists(fs, filePath);
    if (!exists) {
      return undefined;
    }

    const value = (yield* Effect.orDie(fs.readFileString(filePath, 'utf8'))).trim();
    return value.length > 0 ? value : undefined;
  });

export const readInstalledReleaseTag = (
  execPath: string
): Effect.Effect<string | undefined, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* readTextFileIfPresent(
      fs,
      path.join(path.dirname(execPath), RUN_COMPANION_RELEASE_TAG_FILENAME)
    );
  });

export const normalizeCliReleaseVersion = (releaseIdentifier: string): string => {
  const trimmed = releaseIdentifier.trim();
  if (trimmed.startsWith(CLI_RELEASE_TAG_PREFIX)) {
    return trimmed.slice(CLI_RELEASE_TAG_PREFIX.length);
  }
  if (/^v\d+\.\d+\.\d+(?:[-+].*)?$/.test(trimmed)) {
    return trimmed.slice(1);
  }
  return trimmed;
};

export const normalizeCliReleaseTag = (releaseIdentifier: string): string =>
  `${CLI_RELEASE_TAG_PREFIX}${normalizeCliReleaseVersion(releaseIdentifier)}`;

export const resolveInstalledCliVersion = (
  execPath: string,
  fallbackVersion: string
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.map(readInstalledReleaseTag(execPath), releaseTag =>
    normalizeCliReleaseVersion(releaseTag ?? fallbackVersion)
  );

export const resolveInstalledCliReleaseTag = (
  execPath: string,
  fallbackVersion: string
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.map(readInstalledReleaseTag(execPath), releaseTag =>
    normalizeCliReleaseTag(releaseTag ?? fallbackVersion)
  );

export const resolveRunningCliVersion = (
  execPath: string,
  appVersion: string,
  isReleaseBuild = IS_RELEASE_BUILD
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  isReleaseBuild
    ? Effect.succeed(normalizeCliReleaseVersion(appVersion))
    : resolveInstalledCliVersion(execPath, appVersion);

export const resolveRunningCliReleaseTag = (
  execPath: string,
  appVersion: string,
  isReleaseBuild = IS_RELEASE_BUILD
): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.map(
    resolveRunningCliVersion(execPath, appVersion, isReleaseBuild),
    normalizeCliReleaseTag
  );

export const writeInstalledReleaseTag = (
  installDir: string,
  releaseTag: string
): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.writeFileString(
      path.join(installDir, RUN_COMPANION_RELEASE_TAG_FILENAME),
      `${releaseTag}\n`
    );
  });

/**
 * Startup tier: the `run-*.mjs` companion wrappers and their import graph.
 *
 * Every `composio run` preloads these into the spawned child, so a missing one
 * really is a broken install and justifies the self-repair download. The ACP
 * adapter assets are deliberately excluded — a script like
 * `composio run 'console.log(1)'` never invokes a sub-agent, and requiring
 * ~224MB of adapters for it turned a working install into a hard failure.
 * `run-subagent-acp` checks the ACP tier lazily at the invocation site instead.
 */
export const listMissingInstalledRunCompanionModules = (
  execPath: string
): Effect.Effect<ReadonlyArray<string>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const installDirectory = path.dirname(execPath);
    const expectedRelativePaths = yield* collectExpectedRunCompanionAssetRelativePaths(
      installDirectory,
      { staticAssetRelativePaths: [] }
    );
    return yield* Effect.filter(expectedRelativePaths, relativePath =>
      Effect.map(fileExists(fs, path.join(installDirectory, relativePath)), exists => !exists)
    );
  });

/**
 * Whether the companion wrappers sit next to the executable, which is how
 * packaged installs ship them.
 *
 * This distinguishes an install whose shipped assets went missing (report the
 * fix: reinstall / `composio upgrade`) from a source checkout that never had
 * them, where the CLI runs through `bun` and the npx/PATH adapter fallbacks are
 * the intended route.
 */
export const hasInstalledRunCompanionModules = (
  execPath: string
): Effect.Effect<boolean, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const installDirectory = path.dirname(execPath);
    const missing = yield* Effect.findFirst(RUN_COMPANION_MODULE_FILENAMES, fileName =>
      Effect.map(fileExists(fs, path.join(installDirectory, fileName)), exists => !exists)
    );
    return Option.isNone(missing);
  });

const fetchGitHubJson = async <A, I>(
  schema: Schema.Schema<A, I>,
  {
    url,
    accessToken,
    fetchErrorMessage,
  }: {
    url: string;
    accessToken?: string;
    fetchErrorMessage: string;
  }
): Promise<A> => {
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

  return Schema.decodeUnknownPromise(schema)(await response.json());
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

  return parseChecksumsText(await response.text());
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
  const actualHash = await sha256Hex(data);

  if (actualHash !== expectedHash) {
    throw new Error(
      `Checksum mismatch while repairing ${fileName}\n  Expected: ${expectedHash}\n  Actual:   ${actualHash}`
    );
  }
};

const toRepairError = (error: unknown) =>
  new RunCompanionRepairError({
    message: error instanceof Error ? error.message : String(error),
    cause: error,
  });

// Self-repair honors the unprefixed GITHUB_* contract (set by CI and the binary
// build workflow, mirrored by cli-local-tools) first, then falls back to the
// CLI-wide COMPOSIO_-prefixed spelling installed by cli-main's config provider.
const repairConfigProvider = BaseConfigProviderLive.pipe(
  ConfigProvider.orElse(() => extendConfigProvider(BaseConfigProviderLive))
);

const resolveRepairReleaseTag = ({
  execPath,
  appVersion,
}: {
  execPath: string;
  appVersion: string;
}) =>
  Effect.gen(function* () {
    // GITHUB_TAG pins the release used for self-repair (set by the binary build workflow).
    const pinnedTag = yield* Effect.orDie(
      Config.option(Config.string('GITHUB_TAG')).pipe(
        Config.map(tag => Option.getOrUndefined(Option.map(tag, value => value.trim())))
      )
    ).pipe(Effect.withConfigProvider(repairConfigProvider));
    if (pinnedTag) {
      return pinnedTag;
    }

    return yield* resolveRunningCliReleaseTag(execPath, appVersion);
  });

const nonEmptyConfigWithFallback = (name: string, fallback: string) =>
  Config.string(name).pipe(
    Config.map(value => value || fallback),
    Config.withDefault(fallback)
  );

// The GITHUB_* overrides let CI and forks redirect the self-repair download.
const githubRepairConfig = Effect.orDie(
  Effect.all({
    apiBaseUrl: nonEmptyConfigWithFallback('GITHUB_API_BASE_URL', DEFAULT_GITHUB_CONFIG.apiBaseUrl),
    owner: nonEmptyConfigWithFallback('GITHUB_OWNER', DEFAULT_GITHUB_CONFIG.owner),
    repo: nonEmptyConfigWithFallback('GITHUB_REPO', DEFAULT_GITHUB_CONFIG.repo),
    accessToken: Config.option(Config.string('GITHUB_ACCESS_TOKEN')).pipe(
      Config.map(Option.getOrUndefined)
    ),
  })
).pipe(Effect.withConfigProvider(repairConfigProvider));

/**
 * Restores a packaged install whose companion wrappers went missing.
 *
 * Triggered by the startup tier only (`listMissingInstalledRunCompanionModules`),
 * so a plain `composio run` never downloads a release just because the ACP
 * adapters are absent. Once it does run it restores the host's full asset set,
 * ACP adapters included, so a repaired install is a complete one.
 */
export const repairMissingInstalledRunCompanionModules = ({
  callerImportMetaUrl,
  execPath,
  appVersion,
}: {
  callerImportMetaUrl: string;
  execPath: string;
  appVersion: string;
}): Effect.Effect<
  { readonly repaired: false } | { readonly repaired: true; readonly releaseTag: string },
  RunCompanionRepairError | PlatformError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const currentFilePath = yield* filePathFromUrl(path, callerImportMetaUrl);
    if (!currentFilePath.startsWith('/$bunfs/')) {
      return { repaired: false as const };
    }

    const missingModules = yield* listMissingInstalledRunCompanionModules(execPath);
    if (missingModules.length === 0) {
      return { repaired: false as const };
    }

    const releaseTag = yield* resolveRepairReleaseTag({ execPath, appVersion });
    const githubConfig = yield* githubRepairConfig;

    const encodedTag = encodeURIComponent(releaseTag);
    const release = yield* Effect.tryPromise({
      try: () =>
        fetchGitHubJson(GitHubRelease, {
          url: `${githubConfig.apiBaseUrl}/repos/${githubConfig.owner}/${githubConfig.repo}/releases/tags/${encodedTag}`,
          accessToken: githubConfig.accessToken,
          fetchErrorMessage: `Failed to fetch release metadata for ${releaseTag} while repairing run companion modules`,
        }),
      catch: error =>
        new RunCompanionRepairError({
          message: [
            `Unable to restore the files required by 'composio run' for ${releaseTag}.`,
            error instanceof Error ? error.message : String(error),
            `Reinstall the CLI, or set GITHUB_TAG to the exact release tag for this build and try again.`,
          ].join('\n'),
          cause: error,
        }),
    });

    const assetName = resolveBinaryAssetName({});
    if (!assetName) {
      return yield* Effect.fail(
        new RunCompanionRepairError({
          message: `Unsupported platform for run companion repair: ${process.platform}-${process.arch}`,
        })
      );
    }

    const asset = release.assets.find(candidate => candidate.name === assetName);
    if (!asset) {
      return yield* Effect.fail(
        new RunCompanionRepairError({
          message: `Release ${release.tag_name} does not contain ${assetName}; cannot restore run companion modules.`,
        })
      );
    }

    const archiveData = yield* Effect.tryPromise({
      try: async () => {
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
        return new Uint8Array(await archiveResponse.arrayBuffer());
      },
      catch: toRepairError,
    });

    const checksums = yield* Effect.tryPromise({
      try: () =>
        fetchChecksums({
          release,
          accessToken: githubConfig.accessToken,
        }),
      catch: toRepairError,
    });
    const expectedChecksum = checksums?.get(asset.name);
    if (expectedChecksum) {
      yield* Effect.tryPromise({
        try: () =>
          verifyChecksum({
            data: archiveData,
            expectedHash: expectedChecksum,
            fileName: asset.name,
          }),
        catch: toRepairError,
      });
    }

    return yield* Effect.scoped(
      Effect.gen(function* () {
        const tempDirectory = yield* fs.makeTempDirectoryScoped({
          prefix: 'composio-run-repair-',
        });
        const archivePath = path.join(tempDirectory, asset.name);
        const extractDirectory = path.join(tempDirectory, 'extract');
        const packageDirectory = path.join(extractDirectory, path.parse(asset.name).name);
        yield* fs.writeFile(archivePath, archiveData);
        yield* fs.makeDirectory(extractDirectory, { recursive: true });
        yield* Effect.tryPromise({
          try: () => extractZipSafely(archivePath, extractDirectory),
          catch: toRepairError,
        });

        const installDirectory = path.dirname(execPath);
        const companionRelativePaths =
          yield* collectExpectedRunCompanionAssetRelativePaths(packageDirectory);

        for (const relativePath of companionRelativePaths) {
          const sourcePath = path.join(packageDirectory, relativePath);
          const sourceExists = yield* fileExists(fs, sourcePath);
          if (!sourceExists) {
            return yield* Effect.fail(
              new RunCompanionRepairError({
                message: `Release ${release.tag_name} is missing ${relativePath}; cannot restore the files required by 'composio run'.`,
              })
            );
          }

          const targetPath = path.join(installDirectory, relativePath);
          yield* fs.makeDirectory(path.dirname(targetPath), { recursive: true });
          yield* atomicReplaceFile({ sourcePath, targetPath }).pipe(
            Effect.mapError(
              error =>
                new RunCompanionRepairError({
                  message: [
                    `Unable to restore the files required by 'composio run' for ${releaseTag}.`,
                    error.message,
                    `Reinstall the CLI, or set GITHUB_TAG to the exact release tag for this build and try again.`,
                  ].join('\n'),
                  cause: error.cause,
                })
            )
          );
        }

        yield* writeInstalledReleaseTag(installDirectory, release.tag_name);
        return {
          repaired: true as const,
          releaseTag: release.tag_name,
        };
      })
    );
  });

export const resolveRunCompanionModulePath = ({
  callerImportMetaUrl,
  execPath,
  relativeNoExtensionFromCaller,
}: {
  callerImportMetaUrl: string;
  execPath: string;
  relativeNoExtensionFromCaller: string;
}): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const currentFilePath = yield* filePathFromUrl(path, callerImportMetaUrl);
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

    const found = yield* Effect.findFirst(candidates, candidate => fileExists(fs, candidate));
    return Option.getOrElse(found, () =>
      currentFilePath.startsWith('/$bunfs/')
        ? path.resolve(executableDirectory, `${baseName}.mjs`)
        : path.resolve(currentDirectory, `${baseName}.mjs`)
    );
  });
