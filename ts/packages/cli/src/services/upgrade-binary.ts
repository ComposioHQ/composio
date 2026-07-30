import {
  Data,
  Effect,
  Config,
  Match,
  Option,
  Predicate,
  Record as EffectRecord,
  Schema,
} from 'effect';
import { HttpClient, HttpClientResponse, FileSystem, Path } from '@effect/platform';
import { APP_VERSION } from '../constants';
import { DEBUG_OVERRIDE_CONFIG } from 'src/effects/debug-config';
import { GITHUB_CONFIG } from 'src/effects/github-config';
import { detectPlatform, type PlatformArch } from 'src/effects/detect-platform';
import { CompareSemverError, semverComparator } from 'src/effects/compare-semver';
import { fetchLatestCliRelease, GitHubRelease } from 'src/effects/resolve-cli-release';
import { parseChecksumsText, sha256Hex } from 'src/utils/checksums';

// Note: `node:zlib` does not support Github's zip files
import extractZip from 'extract-zip';
import { renderPrettyError } from './utils/pretty-error';
import { TerminalUI } from './terminal-ui';
import {
  collectExpectedRunCompanionAssetRelativePaths,
  resolveInstalledCliReleaseTag,
} from './run-companion-modules';

export class UpgradeBinaryError extends Data.TaggedError('services/UpgradeBinaryError')<{
  readonly cause?: unknown;
  readonly message?: string;
}> {}

/**
 * CLI binary name constant
 */
export const CLI_BINARY_NAME = 'composio';
const LOCAL_TOOLS_BINARY_ASSET_DIRNAME = 'local-tools-binaries';
export const INSTALL_TRANSACTION_JOURNAL_FILENAME = '.composio-upgrade-transaction.json';
export const INSTALL_TRANSACTION_LOCK_FILENAME = '.composio-upgrade-transaction.lock';
export const INSTALL_TRANSACTION_RECOVERY_LOCK_FILENAME =
  '.composio-upgrade-transaction.recovery.lock';
const INSTALL_TRANSACTION_LOCK_STALE_MS = 5 * 60 * 1000;

const InstallTransactionEntry = Schema.Struct({
  relativePath: Schema.String,
  kind: Schema.Literal('file', 'directory'),
  hadTarget: Schema.Boolean,
});
type InstallTransactionEntry = typeof InstallTransactionEntry.Type;

const InstallTransactionJournal = Schema.Struct({
  transactionId: Schema.String.pipe(Schema.pattern(/^[0-9a-f-]{16,64}$/iu)),
  entries: Schema.Array(InstallTransactionEntry),
});
type InstallTransactionJournal = typeof InstallTransactionJournal.Type;
const InstallTransactionJournalJson = Schema.parseJson(InstallTransactionJournal);

const getBinaryAssetName = (platformArch: PlatformArch) =>
  `${CLI_BINARY_NAME}-${platformArch.platform}-${platformArch.arch}.zip`;

const hasPlatformBinaryAsset = (release: GitHubRelease, platformArch: PlatformArch) =>
  release.assets.some(asset => asset.name === getBinaryAssetName(platformArch));

const GITHUB_CONFIG_ALL = Config.all(GITHUB_CONFIG);

// Dependencies resolved once at service construction time and threaded
// through the module-level helpers below.
export interface UpgradeBinaryContext {
  readonly httpClient: HttpClient.HttpClient;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly githubConfig: Config.Config.Success<typeof GITHUB_CONFIG_ALL>;
}

/**
 * Fetch latest release from GitHub
 */
const fetchGitHubRelease = (
  { githubConfig, httpClient }: UpgradeBinaryContext,
  tag: string
): Effect.Effect<GitHubRelease, UpgradeBinaryError, never> =>
  Effect.gen(function* () {
    const encodedTag = encodeURIComponent(tag);
    const url = `${githubConfig.API_BASE_URL}/repos/${githubConfig.OWNER}/${githubConfig.REPO}/releases/tags/${encodedTag}`;
    const fetchErrorMessage = `Failed to fetch tags/${tag} release from GitHub`;
    yield* Effect.logDebug(`GET ${url}`);

    const response = yield* httpClient.get(url).pipe(
      Effect.mapError(
        cause =>
          new UpgradeBinaryError({
            cause,
            message: fetchErrorMessage,
          })
      )
    );

    if (response.status < 200 || response.status >= 300) {
      const pretty = yield* response.json.pipe(
        Effect.map(json =>
          Predicate.isRecord(json) ? renderPrettyError(EffectRecord.toEntries(json)) : ''
        ),
        Effect.catchAll(() => Effect.succeed(''))
      );

      const cause = pretty ? `HTTP ${response.status}\n${pretty}` : `HTTP ${response.status}`;
      return yield* Effect.fail(
        new UpgradeBinaryError({
          cause,
          message: fetchErrorMessage,
        })
      );
    }

    return yield* HttpClientResponse.schemaBodyJson(GitHubRelease)(response).pipe(
      Effect.mapError(
        cause =>
          new UpgradeBinaryError({
            cause,
            message: 'Failed to parse GitHub release JSON response',
          })
      )
    );
  });

const fetchLatestRelease = (
  ctx: UpgradeBinaryContext,
  platformArch: PlatformArch,
  options: {
    prerelease?: boolean;
    tag?: string;
  } = {}
): Effect.Effect<GitHubRelease, UpgradeBinaryError, never> =>
  Effect.gen(function* () {
    const { githubConfig, httpClient } = ctx;
    const prerelease = options.prerelease ?? false;
    const explicitTag = options.tag ? Option.some(options.tag) : githubConfig.TAG;
    const release = yield* explicitTag.pipe(
      Option.match({
        onNone: Effect.fn(function* () {
          yield* Effect.logDebug(
            `No tag specified, resolving latest package-scoped CLI ${prerelease ? 'beta' : 'stable'} release`
          );
          const latest = yield* fetchLatestCliRelease({
            assetDescription: getBinaryAssetName(platformArch),
            channel: prerelease ? 'beta' : 'stable',
            githubConfig,
            hasRequiredAsset: release => hasPlatformBinaryAsset(release, platformArch),
            httpClient,
          }).pipe(
            Effect.mapError(
              error =>
                new UpgradeBinaryError({
                  cause: error,
                  message: Match.value(error.reason).pipe(
                    Match.when('request', () => 'Failed to fetch releases from GitHub'),
                    Match.when('http-status', () => 'Failed to fetch releases from GitHub'),
                    Match.when('decode', () => 'Failed to parse GitHub releases JSON response'),
                    Match.when(
                      'not-found',
                      () =>
                        `Failed to determine latest CLI ${prerelease ? 'beta' : 'stable'} release from @composio/cli tags on GitHub`
                    ),
                    Match.when(
                      'compare',
                      () =>
                        `Failed to determine latest CLI ${prerelease ? 'beta' : 'stable'} release from @composio/cli tags on GitHub`
                    ),
                    Match.exhaustive
                  ),
                })
            )
          );

          yield* Effect.logDebug(`Resolved latest CLI release tag: ${latest.tag_name}`);
          return latest;
        }),
        onSome: Effect.fn(function* (tag) {
          yield* Effect.logDebug(`Using tag: ${tag}`);
          const release = yield* fetchGitHubRelease(ctx, tag);

          return release;
        }),
      })
    );
    return release;
  });

const provideFsAndPath = <A, E>(
  { fs, path }: UpgradeBinaryContext,
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>
) =>
  effect.pipe(
    Effect.provideService(FileSystem.FileSystem, fs),
    Effect.provideService(Path.Path, path)
  );

/**
 * Check if update is available
 */
const resolveCurrentReleaseIdentifier = (ctx: UpgradeBinaryContext, currentPath: string) =>
  provideFsAndPath(ctx, resolveInstalledCliReleaseTag(currentPath, APP_VERSION));

const isUpdateAvailable = (
  release: GitHubRelease,
  currentReleaseIdentifier: string
): Effect.Effect<boolean, CompareSemverError | UpgradeBinaryError, never> =>
  Effect.gen(function* () {
    // Current version is older than latest
    const isVersionOutdated = (comparison: number) => comparison < 0;
    const comparison = yield* semverComparator(currentReleaseIdentifier, release.tag_name);
    return isVersionOutdated(comparison);
  });

/**
 * Download binary for current platform
 */
export const downloadBinary = (
  { httpClient }: UpgradeBinaryContext,
  release: GitHubRelease,
  platformArch: PlatformArch
): Effect.Effect<{ name: string; data: Uint8Array }, UpgradeBinaryError, never> =>
  Effect.gen(function* () {
    yield* Effect.logDebug(`Looking up binary for ${platformArch.platform}-${platformArch.arch}`);

    const binaryName = getBinaryAssetName(platformArch);

    const asset = release.assets.find(asset => asset.name === binaryName);
    if (!asset) {
      return yield* Effect.fail(
        new UpgradeBinaryError({
          cause: `Binary not found: ${binaryName}`,
          message: `No binary available for ${platformArch.platform}-${platformArch.arch}`,
        })
      );
    }

    yield* Effect.logDebug(`Downloading ${asset.name}...`);

    const response = yield* Effect.gen(function* () {
      const resp = yield* httpClient.get(asset.browser_download_url).pipe(
        Effect.mapError(
          cause =>
            new UpgradeBinaryError({
              cause,
              message: `Failed to download binary: ${asset.name}`,
            })
        )
      );
      if (resp.status < 200 || resp.status >= 300) {
        return yield* Effect.fail(
          new UpgradeBinaryError({
            cause: `HTTP ${resp.status}`,
            message: `Failed to download binary: ${asset.name}`,
          })
        );
      }
      return resp;
    });

    const arrayBuffer = yield* Effect.gen(function* () {
      return yield* response.arrayBuffer;
    }).pipe(
      Effect.mapError(
        cause =>
          new UpgradeBinaryError({
            cause,
            message: 'Failed to read downloaded binary',
          })
      )
    );

    return {
      name: binaryName,
      data: new Uint8Array(arrayBuffer),
    };
  });

/**
 * Fetch checksums.txt from a release, if available.
 * Returns the parsed map of filename -> expected SHA-256 hash, or None if not found.
 */
export const fetchChecksums = (
  { httpClient }: UpgradeBinaryContext,
  release: GitHubRelease
): Effect.Effect<Option.Option<Map<string, string>>, never, never> =>
  Effect.gen(function* () {
    const checksumsAsset = release.assets.find(a => a.name === 'checksums.txt');
    if (!checksumsAsset) {
      yield* Effect.logDebug('No checksums.txt found in release assets');
      return Option.none();
    }

    const response = yield* httpClient
      .get(checksumsAsset.browser_download_url)
      .pipe(Effect.catchAll(() => Effect.succeed(null)));

    if (!response || response.status < 200 || response.status >= 300) {
      yield* Effect.logDebug('Failed to download checksums.txt');
      return Option.none();
    }

    const text = yield* response.text.pipe(Effect.catchAll(() => Effect.succeed('')));
    if (!text) {
      return Option.none();
    }

    return Option.some(parseChecksumsText(text));
  });

/**
 * Verify SHA-256 checksum of downloaded data against expected hash.
 */
export const verifyChecksum = (
  data: Uint8Array,
  expectedHash: string,
  fileName: string
): Effect.Effect<void, UpgradeBinaryError> =>
  Effect.gen(function* () {
    const actual = yield* Effect.tryPromise({
      try: () => sha256Hex(data),
      catch: error =>
        new UpgradeBinaryError({
          cause: error,
          message: 'Failed to compute SHA-256 checksum',
        }),
    });

    if (actual !== expectedHash) {
      return yield* Effect.fail(
        new UpgradeBinaryError({
          message: `Checksum mismatch for ${fileName}\n  Expected: ${expectedHash}\n  Actual:   ${actual}`,
        })
      );
    }

    yield* Effect.logDebug(`Checksum verified for ${fileName}`);
  });

/**
 * Extract binary from zip archive using FileSystem
 */
export const extractBinary = (
  { fs, path }: UpgradeBinaryContext,
  { name, data }: { name: string; data: Uint8Array },
  tempDir: string
): Effect.Effect<{ binaryPath: string; packageDir: string }, UpgradeBinaryError, never> =>
  Effect.gen(function* () {
    const zipPath = path.join(tempDir, name);
    const extractDir = path.join(tempDir, 'extract');
    const packageDir = path.join(extractDir, path.parse(name).name);
    const binaryPath = path.join(packageDir, CLI_BINARY_NAME);

    yield* Effect.logDebug(`Download zip to ${extractDir}`);

    // Write zip file
    yield* fs.writeFile(zipPath, data).pipe(
      Effect.mapError(
        cause =>
          new UpgradeBinaryError({
            cause,
            message: 'Failed to write zip file',
          })
      )
    );

    // Create extract directory
    yield* fs.makeDirectory(extractDir, { recursive: true }).pipe(
      Effect.mapError(
        cause =>
          new UpgradeBinaryError({
            cause,
            message: 'Failed to create extract directory',
          })
      )
    );

    yield* Effect.tryPromise({
      try: async () => {
        await extractZip(zipPath, { dir: extractDir });
      },
      catch: error =>
        new UpgradeBinaryError({
          cause: error,
          message: 'Failed to extract zip archive',
        }),
    });

    // Check if binary exists
    const exists = yield* fs.exists(binaryPath).pipe(Effect.catchAll(() => Effect.succeed(false)));

    if (!exists) {
      return yield* Effect.fail(
        new UpgradeBinaryError({
          cause: `Binary not found in archive: ${binaryPath}`,
          message: 'Extracted archive does not contain expected binary',
        })
      );
    }

    // Make executable
    yield* fs.chmod(binaryPath, 0o755).pipe(
      Effect.mapError(
        cause =>
          new UpgradeBinaryError({
            cause,
            message: 'Failed to make binary executable',
          })
      )
    );

    return {
      binaryPath,
      packageDir,
    };
  });

/**
 * Get current executable path
 */
export const getCurrentExecutablePath = Effect.fn(function* () {
  // E.g., ~/.composio/composio
  const currentPath = process.execPath;

  const runtimesPaths: Array<string | null> = [Bun.which('bun'), Bun.which('node')];

  if (runtimesPaths.includes(currentPath)) {
    return yield* Effect.fail(
      new UpgradeBinaryError({
        cause: 'Currently using Composio CLI via Bun or Node.js runtime',
        message:
          'Cannot upgrade runtime binary. Please run the upgrade command from a self-contained Composio CLI binary.',
      })
    );
  }

  return currentPath;
});

const tempSiblingPath = (path: Path.Path, targetPath: string) =>
  path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.tmp-${Math.random().toString(36).slice(2)}`
  );

const syncFile = (fs: FileSystem.FileSystem, filePath: string) =>
  Effect.scoped(Effect.flatMap(fs.open(filePath, { flag: 'r+' }), file => file.sync));

interface InstallTransactionPaths extends InstallTransactionEntry {
  readonly targetPath: string;
  readonly stagedPath: string;
  readonly backupPath: string;
}

type InstallSource =
  | {
      readonly kind: 'file';
      readonly relativePath: string;
      readonly sourcePath?: string;
      readonly content?: string;
      readonly executable?: boolean;
    }
  | {
      readonly kind: 'directory';
      readonly relativePath: string;
      readonly sourcePath: string;
    };

const transactionSiblingPath = (
  path: Path.Path,
  targetPath: string,
  purpose: 'staged' | 'backup',
  transactionId: string
) =>
  path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${purpose}-${transactionId}`);

const resolveTransactionPaths = (
  path: Path.Path,
  installDir: string,
  journal: InstallTransactionJournal
): Effect.Effect<ReadonlyArray<InstallTransactionPaths>, UpgradeBinaryError> =>
  Effect.forEach(journal.entries, entry =>
    Effect.gen(function* () {
      const relativePath = path.normalize(entry.relativePath);
      const targetPath = path.resolve(installDir, relativePath);
      const relativeToInstall = path.relative(installDir, targetPath);
      const isWithinInstall =
        relativeToInstall !== '' &&
        relativeToInstall !== '..' &&
        !relativeToInstall.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relativeToInstall);
      if (!isWithinInstall) {
        return yield* Effect.fail(
          new UpgradeBinaryError({
            cause: `Unsafe transaction path: ${entry.relativePath}`,
            message: 'Refusing to recover invalid upgrade transaction',
          })
        );
      }
      return {
        ...entry,
        relativePath,
        targetPath,
        stagedPath: transactionSiblingPath(path, targetPath, 'staged', journal.transactionId),
        backupPath: transactionSiblingPath(path, targetPath, 'backup', journal.transactionId),
      } satisfies InstallTransactionPaths;
    })
  );

const writeAtomicTextFile = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  targetPath: string,
  contents: string
) =>
  Effect.gen(function* () {
    const stagedPath = tempSiblingPath(path, targetPath);
    yield* fs.writeFileString(stagedPath, contents).pipe(
      Effect.andThen(syncFile(fs, stagedPath)),
      Effect.andThen(fs.rename(stagedPath, targetPath)),
      Effect.onError(() => fs.remove(stagedPath, { force: true }).pipe(Effect.ignore))
    );
  });

const readInstallTransaction = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  installDir: string
): Effect.Effect<Option.Option<InstallTransactionJournal>, UpgradeBinaryError> =>
  Effect.gen(function* () {
    const journalPath = path.join(installDir, INSTALL_TRANSACTION_JOURNAL_FILENAME);
    if (!(yield* fs.exists(journalPath))) {
      return Option.none<InstallTransactionJournal>();
    }
    const raw = yield* fs.readFileString(journalPath, 'utf8');
    const journal = yield* Schema.decode(InstallTransactionJournalJson)(raw);
    return Option.some(journal);
  }).pipe(
    Effect.mapError(
      cause =>
        new UpgradeBinaryError({
          cause,
          message: 'Failed to read interrupted upgrade transaction',
        })
    )
  );

const rollbackInstallTransaction = (
  fs: FileSystem.FileSystem,
  entries: ReadonlyArray<InstallTransactionPaths>
): Effect.Effect<void, UpgradeBinaryError> =>
  Effect.forEach(
    [...entries].reverse(),
    entry =>
      Effect.gen(function* () {
        const backupExists = yield* fs.exists(entry.backupPath);
        if (entry.hadTarget) {
          if (!backupExists) {
            // This entry was not committed yet: its old target is still live.
            yield* fs
              .remove(entry.stagedPath, { recursive: true, force: true })
              .pipe(Effect.ignore);
            return;
          }
          // Covers both crash states after the atomic old->backup rename:
          // target absent (before staged->target) and target new (after it).
          yield* fs.remove(entry.targetPath, { recursive: true, force: true });
          yield* fs.rename(entry.backupPath, entry.targetPath);
        } else {
          yield* fs.remove(entry.targetPath, { recursive: true, force: true });
        }
        yield* fs.remove(entry.stagedPath, { recursive: true, force: true }).pipe(Effect.ignore);
      }).pipe(
        Effect.mapError(
          cause =>
            new UpgradeBinaryError({
              cause,
              message: `Failed to roll back installed artifact: ${entry.relativePath}`,
            })
        )
      ),
    { discard: true }
  );

const clearTransactionArtifacts = (
  fs: FileSystem.FileSystem,
  entries: ReadonlyArray<InstallTransactionPaths>
) =>
  Effect.forEach(
    entries,
    entry =>
      Effect.all(
        [
          fs.remove(entry.stagedPath, { recursive: true, force: true }).pipe(Effect.ignore),
          fs.remove(entry.backupPath, { recursive: true, force: true }).pipe(Effect.ignore),
        ],
        { discard: true }
      ),
    { discard: true }
  );

const readLockOwner = (fs: FileSystem.FileSystem, lockPath: string) =>
  fs.readFileString(lockPath, 'utf8').pipe(
    Effect.map(value => Option.some(value.trim())),
    Effect.orElseSucceed(() => Option.none<string>())
  );

const createOwnedLock = (fs: FileSystem.FileSystem, lockPath: string, owner: string) =>
  Effect.gen(function* () {
    const created = yield* Effect.scoped(fs.open(lockPath, { flag: 'wx' })).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false)
    );
    if (!created) return false;
    return yield* fs.writeFileString(lockPath, owner).pipe(
      Effect.as(true),
      Effect.tapError(() => fs.remove(lockPath, { force: true }).pipe(Effect.ignore)),
      Effect.orElseSucceed(() => false)
    );
  });

/**
 * Claims recovery with an owner token. Stale retirement uses rename rather
 * than stat->remove, and the retired token is checked before the caller may
 * mutate install state. This closes the stale-lock ABA race.
 */
const acquireRecoveryClaim = (fs: FileSystem.FileSystem, recoveryLockPath: string) =>
  Effect.gen(function* () {
    const owner = crypto.randomUUID();
    if (yield* createOwnedLock(fs, recoveryLockPath, owner)) {
      return Option.some(owner);
    }

    const lockInfo = yield* Effect.option(fs.stat(recoveryLockPath));
    if (Option.isNone(lockInfo)) return Option.none<string>();
    const lockedAt = Option.getOrUndefined(lockInfo.value.mtime)?.getTime();
    if (lockedAt !== undefined && Date.now() - lockedAt < INSTALL_TRANSACTION_LOCK_STALE_MS) {
      return Option.none<string>();
    }

    const expectedOwner = yield* readLockOwner(fs, recoveryLockPath);
    const retiredPath = `${recoveryLockPath}.retired-${owner}`;
    const retired = yield* Effect.option(fs.rename(recoveryLockPath, retiredPath));
    if (Option.isNone(retired)) return Option.none<string>();

    const retiredOwner = yield* readLockOwner(fs, retiredPath);
    if (
      Option.isSome(expectedOwner) &&
      Option.isSome(retiredOwner) &&
      retiredOwner.value !== expectedOwner.value
    ) {
      // The path changed between stat/read and rename. Do not treat the newer
      // owner's file as our stale claim.
      yield* fs.rename(retiredPath, recoveryLockPath).pipe(Effect.ignore);
      return Option.none<string>();
    }

    const claimed = yield* createOwnedLock(fs, recoveryLockPath, owner);
    yield* fs.remove(retiredPath, { force: true }).pipe(Effect.ignore);
    return claimed ? Option.some(owner) : Option.none<string>();
  }).pipe(Effect.orElseSucceed(() => Option.none<string>()));

const refreshRecoveryClaim = (fs: FileSystem.FileSystem, recoveryLockPath: string, owner: string) =>
  Effect.gen(function* () {
    const currentOwner = yield* readLockOwner(fs, recoveryLockPath);
    if (Option.isNone(currentOwner) || currentOwner.value !== owner) {
      return false;
    }
    yield* fs.writeFileString(recoveryLockPath, owner);
    const refreshedOwner = yield* readLockOwner(fs, recoveryLockPath);
    return Option.isSome(refreshedOwner) && refreshedOwner.value === owner;
  }).pipe(Effect.orElseSucceed(() => false));

const releaseRecoveryClaim = (fs: FileSystem.FileSystem, recoveryLockPath: string, owner: string) =>
  Effect.gen(function* () {
    const currentOwner = yield* readLockOwner(fs, recoveryLockPath);
    if (Option.isSome(currentOwner) && currentOwner.value === owner) {
      yield* fs.remove(recoveryLockPath, { force: true });
    }
  }).pipe(Effect.ignore);

export type InterruptedUpgradeRecovery = 'none' | 'busy' | 'recovered';

/**
 * Rolls back a transaction interrupted by process termination. Callers must do
 * this before dispatching a command; after recovery the already-loaded image
 * may differ from the restored install and should exit rather than continue.
 */
export const recoverInterruptedBinaryReplacement = (
  targetPath: string
): Effect.Effect<
  InterruptedUpgradeRecovery,
  UpgradeBinaryError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const installDir = path.dirname(targetPath);
    const recoveryLockPath = path.join(installDir, INSTALL_TRANSACTION_RECOVERY_LOCK_FILENAME);
    const lockPath = path.join(installDir, INSTALL_TRANSACTION_LOCK_FILENAME);

    // The healthy startup path is read-only. In particular, a first-party
    // install may live on a read-only mount and must not be treated as busy
    // merely because no recovery work exists.
    const preflightJournal = yield* readInstallTransaction(fs, path, installDir);
    const preflightLock = yield* Effect.option(fs.stat(lockPath));
    const preflightRecoveryLock = yield* Effect.option(fs.stat(recoveryLockPath));
    if (
      Option.isNone(preflightJournal) &&
      Option.isNone(preflightLock) &&
      Option.isNone(preflightRecoveryLock)
    ) {
      return 'none';
    }
    if (Option.isSome(preflightRecoveryLock)) {
      const lockedAt = Option.getOrUndefined(preflightRecoveryLock.value.mtime)?.getTime();
      if (lockedAt !== undefined && Date.now() - lockedAt < INSTALL_TRANSACTION_LOCK_STALE_MS) {
        return 'busy';
      }
    }
    if (Option.isSome(preflightLock)) {
      const lockedAt = Option.getOrUndefined(preflightLock.value.mtime)?.getTime();
      if (lockedAt !== undefined && Date.now() - lockedAt < INSTALL_TRANSACTION_LOCK_STALE_MS) {
        return 'busy';
      }
    }

    const recoveryOwner = yield* acquireRecoveryClaim(fs, recoveryLockPath);
    if (Option.isNone(recoveryOwner)) return 'busy';

    return yield* Effect.gen(function* () {
      const journal = yield* readInstallTransaction(fs, path, installDir);
      const lockInfo = yield* Effect.option(fs.stat(lockPath));
      if (Option.isNone(journal)) {
        if (Option.isNone(lockInfo)) return 'none';
        const lockedAt = Option.getOrUndefined(lockInfo.value.mtime)?.getTime();
        if (lockedAt !== undefined && Date.now() - lockedAt < INSTALL_TRANSACTION_LOCK_STALE_MS) {
          return 'busy';
        }
        // The process died after taking the install lock but before publishing
        // a journal. Under the recovery claim it is safe to retire this orphan.
        yield* fs.remove(lockPath, { force: true });
        return 'none';
      }
      if (Option.isSome(lockInfo)) {
        const lockedAt = Option.getOrUndefined(lockInfo.value.mtime)?.getTime();
        if (lockedAt !== undefined && Date.now() - lockedAt < INSTALL_TRANSACTION_LOCK_STALE_MS) {
          return 'busy';
        }
        // Keep the stale install lock in place while restoring. Replacements
        // never delete it, so no new transaction can enter between recovery
        // steps.
      }

      if (!(yield* refreshRecoveryClaim(fs, recoveryLockPath, recoveryOwner.value))) {
        return 'busy';
      }
      const entries = yield* resolveTransactionPaths(path, installDir, journal.value);
      yield* rollbackInstallTransaction(fs, entries);
      yield* fs
        .remove(path.join(installDir, INSTALL_TRANSACTION_JOURNAL_FILENAME), { force: true })
        .pipe(
          Effect.mapError(
            cause =>
              new UpgradeBinaryError({
                cause,
                message: 'Failed to finish interrupted upgrade recovery',
              })
          )
        );
      yield* clearTransactionArtifacts(fs, entries);
      yield* fs.remove(lockPath, { force: true }).pipe(Effect.ignore);
      return 'recovered';
    }).pipe(Effect.ensuring(releaseRecoveryClaim(fs, recoveryLockPath, recoveryOwner.value)));
  }).pipe(
    Effect.mapError(cause =>
      cause instanceof UpgradeBinaryError
        ? cause
        : new UpgradeBinaryError({
            cause,
            message: 'Failed to recover interrupted CLI upgrade',
          })
    )
  );

const prepareInstallTransaction = (
  ctx: UpgradeBinaryContext,
  installDir: string,
  transactionId: string,
  sources: ReadonlyArray<InstallSource>
): Effect.Effect<
  {
    readonly journal: InstallTransactionJournal;
    readonly entries: ReadonlyArray<InstallTransactionPaths>;
  },
  UpgradeBinaryError
> =>
  Effect.gen(function* () {
    const { fs, path } = ctx;
    const journalEntries = yield* Effect.forEach(sources, source =>
      Effect.gen(function* () {
        const targetPath = path.join(installDir, source.relativePath);
        return InstallTransactionEntry.make({
          relativePath: source.relativePath,
          kind: source.kind,
          hadTarget: yield* fs.exists(targetPath),
        });
      })
    );
    const journal = InstallTransactionJournal.make({
      transactionId,
      entries: journalEntries,
    });
    const entries = yield* resolveTransactionPaths(path, installDir, journal);

    yield* Effect.forEach(
      sources,
      (source, index) =>
        Effect.gen(function* () {
          const entry = entries[index];
          yield* fs.makeDirectory(path.dirname(entry.targetPath), { recursive: true });
          if (source.kind === 'directory') {
            yield* fs.copy(source.sourcePath, entry.stagedPath);
            return;
          }
          if (source.sourcePath) {
            yield* fs.copyFile(source.sourcePath, entry.stagedPath);
          } else {
            yield* fs.writeFileString(entry.stagedPath, source.content ?? '');
          }
          if (source.executable) {
            yield* fs.chmod(entry.stagedPath, 0o755);
          }
          if (source.sourcePath) {
            const sourceInfo = yield* fs.stat(source.sourcePath);
            const stagedInfo = yield* fs.stat(entry.stagedPath);
            if (sourceInfo.size !== stagedInfo.size) {
              return yield* Effect.fail(
                new UpgradeBinaryError({
                  cause: `Size mismatch after copy: expected ${sourceInfo.size}, got ${stagedInfo.size}`,
                  message: `Failed to prepare installed artifact: ${source.relativePath}`,
                })
              );
            }
          }
          yield* syncFile(fs, entry.stagedPath);
        }).pipe(
          Effect.mapError(cause =>
            cause instanceof UpgradeBinaryError
              ? cause
              : new UpgradeBinaryError({
                  cause,
                  message: `Failed to prepare installed artifact: ${source.relativePath}`,
                })
          )
        ),
      { discard: true }
    ).pipe(Effect.onError(() => clearTransactionArtifacts(fs, entries)));

    return { journal, entries };
  }).pipe(
    Effect.mapError(cause =>
      cause instanceof UpgradeBinaryError
        ? cause
        : new UpgradeBinaryError({
            cause,
            message: 'Failed to prepare CLI upgrade transaction',
          })
    )
  );

const commitInstallTransaction = (
  ctx: UpgradeBinaryContext,
  installDir: string,
  journal: InstallTransactionJournal,
  entries: ReadonlyArray<InstallTransactionPaths>
): Effect.Effect<void, UpgradeBinaryError> =>
  Effect.gen(function* () {
    const { fs, path } = ctx;
    const journalPath = path.join(installDir, INSTALL_TRANSACTION_JOURNAL_FILENAME);
    const encodedJournal = yield* Schema.encode(InstallTransactionJournalJson)(journal).pipe(
      Effect.mapError(
        cause => new UpgradeBinaryError({ cause, message: 'Failed to encode upgrade transaction' })
      )
    );
    yield* writeAtomicTextFile(fs, path, journalPath, encodedJournal).pipe(
      Effect.mapError(
        cause => new UpgradeBinaryError({ cause, message: 'Failed to record upgrade transaction' })
      )
    );

    const commit = Effect.forEach(
      entries,
      entry =>
        Effect.gen(function* () {
          if (entry.hadTarget) {
            // A backup becomes visible in one rename. Recovery never has to
            // guess whether a copied backup is complete.
            yield* fs.rename(entry.targetPath, entry.backupPath);
          }
          yield* fs.rename(entry.stagedPath, entry.targetPath);
        }).pipe(
          Effect.mapError(
            cause =>
              new UpgradeBinaryError({
                cause,
                message: `Failed to commit installed artifact: ${entry.relativePath}`,
              })
          )
        ),
      { discard: true }
    ).pipe(
      Effect.andThen(
        fs.remove(journalPath, { force: true }).pipe(
          Effect.mapError(
            cause =>
              new UpgradeBinaryError({
                cause,
                message: 'Failed to commit upgrade transaction metadata',
              })
          )
        )
      )
    );

    yield* commit.pipe(
      Effect.catchAll(commitError =>
        rollbackInstallTransaction(fs, entries).pipe(
          Effect.andThen(fs.remove(journalPath, { force: true })),
          Effect.andThen(clearTransactionArtifacts(fs, entries)),
          Effect.matchEffect({
            onSuccess: () => Effect.fail(commitError),
            onFailure: rollbackError =>
              Effect.fail(
                new UpgradeBinaryError({
                  cause: { commitError, rollbackError },
                  message:
                    'Upgrade failed and automatic rollback was incomplete; recovery is required',
                })
              ),
          })
        )
      )
    );

    // The journal is gone, so leftover backups cannot be mistaken for an
    // interrupted install. Cleanup is deliberately best-effort.
    yield* clearTransactionArtifacts(fs, entries);
  });

/**
 * Prepares every managed install artifact before publishing a journal, then
 * commits each old->backup and staged->target transition by atomic rename.
 * Any ordinary failure rolls the whole release back; process termination is
 * recovered from the journal before the next command is dispatched.
 */
export const replaceBinary = (
  ctx: UpgradeBinaryContext,
  sourcePath: string,
  targetPath: string,
  options: {
    releaseTag?: string;
  } = {}
): Effect.Effect<void, UpgradeBinaryError> =>
  Effect.gen(function* () {
    const { fs, path } = ctx;
    yield* Effect.logDebug(`Replacing binary: ${sourcePath} -> ${targetPath}`);

    const sourceDirectory = path.dirname(sourcePath);
    const targetDirectory = path.dirname(targetPath);
    const lockPath = path.join(targetDirectory, INSTALL_TRANSACTION_LOCK_FILENAME);
    yield* fs
      .makeDirectory(targetDirectory, { recursive: true })
      .pipe(
        Effect.mapError(
          cause =>
            new UpgradeBinaryError({ cause, message: 'Failed to prepare CLI install directory' })
        )
      );

    const claimed = yield* Effect.scoped(fs.open(lockPath, { flag: 'wx' })).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false)
    );
    if (!claimed) {
      return yield* Effect.fail(
        new UpgradeBinaryError({ message: 'Another CLI upgrade is already in progress' })
      );
    }

    yield* Effect.gen(function* () {
      const recoveryLockPath = path.join(
        targetDirectory,
        INSTALL_TRANSACTION_RECOVERY_LOCK_FILENAME
      );
      if (yield* fs.exists(recoveryLockPath)) {
        return yield* Effect.fail(
          new UpgradeBinaryError({ message: 'A CLI upgrade recovery is already in progress' })
        );
      }

      // Recovery is a bootstrap responsibility. A replacement never deletes a
      // stale lock or mutates an interrupted transaction.
      const interrupted = yield* readInstallTransaction(fs, path, targetDirectory);
      if (Option.isSome(interrupted)) {
        return yield* Effect.fail(
          new UpgradeBinaryError({
            message: 'An interrupted CLI upgrade must be recovered before replacing the binary',
          })
        );
      }

      const companionRelativePaths = yield* provideFsAndPath(
        ctx,
        collectExpectedRunCompanionAssetRelativePaths(sourceDirectory)
      );
      for (const relativePath of companionRelativePaths) {
        const sourceCompanion = path.join(sourceDirectory, relativePath);
        const sourceExists = yield* fs
          .exists(sourceCompanion)
          .pipe(Effect.orElseSucceed(() => false));

        if (!sourceExists) {
          return yield* Effect.fail(
            new UpgradeBinaryError({
              cause: `Missing companion module: ${sourceCompanion}`,
              message: 'Downloaded binary package is incomplete',
            })
          );
        }
      }

      if (!(yield* fs.exists(sourcePath).pipe(Effect.orElseSucceed(() => false)))) {
        return yield* Effect.fail(
          new UpgradeBinaryError({
            cause: `Missing binary: ${sourcePath}`,
            message: 'Failed to replace binary',
          })
        );
      }

      const sources: InstallSource[] = companionRelativePaths.map(relativePath => ({
        kind: 'file',
        relativePath,
        sourcePath: path.join(sourceDirectory, relativePath),
      }));

      const localToolsAssetSource = path.join(sourceDirectory, LOCAL_TOOLS_BINARY_ASSET_DIRNAME);
      if (yield* fs.exists(localToolsAssetSource).pipe(Effect.orElseSucceed(() => false))) {
        sources.push({
          kind: 'directory',
          relativePath: LOCAL_TOOLS_BINARY_ASSET_DIRNAME,
          sourcePath: localToolsAssetSource,
        });
      }

      sources.push({
        kind: 'file',
        relativePath: path.relative(targetDirectory, targetPath),
        sourcePath,
        executable: true,
      });
      if (options.releaseTag) {
        sources.push({
          kind: 'file',
          relativePath: 'release-tag.txt',
          content: `${options.releaseTag}\n`,
        });
      }

      const transactionId = crypto.randomUUID();
      const prepared = yield* prepareInstallTransaction(
        ctx,
        targetDirectory,
        transactionId,
        sources
      );
      yield* commitInstallTransaction(ctx, targetDirectory, prepared.journal, prepared.entries);
    }).pipe(Effect.ensuring(fs.remove(lockPath, { force: true }).pipe(Effect.ignore)));
  }).pipe(
    Effect.mapError(cause =>
      cause instanceof UpgradeBinaryError
        ? cause
        : new UpgradeBinaryError({
            cause,
            message: 'Failed to replace CLI installation',
          })
    )
  );

/**
 * Main upgrade function
 */
const upgrade = (
  ctx: UpgradeBinaryContext,
  options: {
    prerelease?: boolean;
    tag?: string;
  } = {}
) =>
  Effect.gen(function* () {
    const ui = yield* TerminalUI;
    const upgradeTargetOpt = yield* DEBUG_OVERRIDE_CONFIG['UPGRADE_TARGET'];
    const currentPath = yield* getCurrentExecutablePath();
    const prerelease = options.prerelease ?? false;
    const explicitTag = options.tag;
    const currentReleaseIdentifier = yield* resolveCurrentReleaseIdentifier(ctx, currentPath);
    yield* Effect.logDebug(`Current executable path: ${currentPath}`);
    yield* Effect.logDebug(`Current release identifier: ${currentReleaseIdentifier}`);

    yield* ui.intro('composio upgrade');

    // If local binary path is provided (for testing), use it directly
    if (Option.isSome(upgradeTargetOpt)) {
      yield* ui.log.info(`New local version available (current: ${currentReleaseIdentifier})`);
      yield* replaceBinary(ctx, upgradeTargetOpt.value, currentPath);
      yield* ui.outro('Upgrade completed');
      return undefined;
    }

    const didUpgrade = yield* ui.useMakeSpinner('Checking for updates...', spinner =>
      Effect.gen(function* () {
        const platformArch = yield* detectPlatform;
        const release = yield* fetchLatestRelease(ctx, platformArch, {
          prerelease,
          tag: explicitTag,
        });
        if (!explicitTag) {
          const updateAvailable = yield* isUpdateAvailable(release, currentReleaseIdentifier);
          if (!updateAvailable) {
            yield* spinner.stop('You are already running the latest version!');
            return false;
          }
        } else if (release.tag_name === currentReleaseIdentifier) {
          yield* Effect.logDebug(`Already running ${release.tag_name}; re-installing as requested`);
        }

        yield* spinner.message(
          explicitTag
            ? `Installing ${release.tag_name} (current: ${currentReleaseIdentifier})...`
            : `New version available: ${release.tag_name} (current: ${currentReleaseIdentifier}). Downloading...`
        );

        const { name, data } = yield* downloadBinary(ctx, release, platformArch);

        yield* spinner.message('Verifying checksum...');

        const checksums = yield* fetchChecksums(ctx, release);
        if (Option.isSome(checksums)) {
          const expectedHash = checksums.value.get(name);
          if (expectedHash) {
            yield* verifyChecksum(data, expectedHash, name);
          } else {
            yield* Effect.logDebug(`No checksum entry found for ${name} — skipping verification`);
          }
        }

        yield* spinner.message('Extracting...');

        // The temporary directory is automatically cleaned up
        const tmpDir = yield* ctx.fs
          .makeTempDirectoryScoped({ prefix: `${CLI_BINARY_NAME}-upgrade` })
          .pipe(
            Effect.mapError(
              cause =>
                new UpgradeBinaryError({
                  cause,
                  message: 'Failed to create temporary directory',
                })
            )
          );

        const extractedBinary = yield* extractBinary(ctx, { name, data }, tmpDir);
        yield* replaceBinary(ctx, extractedBinary.binaryPath, currentPath, {
          releaseTag: release.tag_name,
        });

        yield* spinner.stop('Upgrade completed!');
        return release.tag_name;
      })
    );

    yield* ui.outro(
      didUpgrade ? 'Restart your terminal to use the new version.' : 'No upgrade needed.'
    );

    return didUpgrade || undefined; // release tag string, or undefined if no upgrade
  });

// Service to manage CLI binary upgrades
export class UpgradeBinary extends Effect.Service<UpgradeBinary>()('services/UpgradeBinary', {
  accessors: true,
  effect: Effect.gen(function* () {
    const ctx: UpgradeBinaryContext = {
      httpClient: yield* HttpClient.HttpClient,
      fs: yield* FileSystem.FileSystem,
      path: yield* Path.Path,
      githubConfig: yield* GITHUB_CONFIG_ALL,
    };

    return {
      upgrade: (options: { prerelease?: boolean; tag?: string } = {}) => upgrade(ctx, options),
    } as const;
  }),
  dependencies: [Path.layer],
}) {}
