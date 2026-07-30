import { FetchHttpClient, FileSystem, HttpClient, Path } from '@effect/platform';
import { BunFileSystem } from '@effect/platform-bun';
import { Cause, Config, Effect, Encoding, Layer, Option, Schema } from 'effect';
import semver from 'semver';
import * as constants from 'src/constants';
import { GITHUB_CONFIG } from 'src/effects/github-config';
import { detectPlatform } from 'src/effects/detect-platform';
import { fetchCliReleaseByTag, type GitHubRelease } from 'src/effects/resolve-cli-release';
import { installSkill } from 'src/effects/install-skill';
import {
  getAutoUpdateAppliedEvent,
  getAutoUpdateFailedEvent,
  getAutoUpdateStagedEvent,
} from 'src/analytics/events';
import type { TrackEvent } from 'src/analytics/types';
import { trackCliEventEffect } from 'src/analytics/dispatch';
import { BaseConfigProviderLive, extendConfigProvider } from './config';
import { getWorkerSpawnArgs, spawnDetached } from './detached-process';
import { NodeOs } from './node-os';
import { bold, cyanBright, dim } from 'src/ui/colors';
import { TerminalUI, TerminalUILive } from './terminal-ui';
import { normalizeCliReleaseVersion, readInstalledReleaseTag } from './run-companion-modules';
import { resolveCliConfigPath } from './cli-user-config';
import { cliUserConfigFromJSON } from 'src/models/cli-user-config';
import {
  CLI_BINARY_NAME,
  downloadBinary,
  extractBinary,
  fetchChecksums,
  replaceBinary,
  verifyChecksum,
  UpgradeBinaryError,
  type UpgradeBinaryContext,
} from './upgrade-binary';
import type { UpdateCheckState } from './update-check';

/**
 * Silent CLI self-update.
 *
 * Two halves, connected by a staging directory (`~/.composio/staging`):
 *
 *   1. STAGE — the 24h background update check calls
 *      `maybeStageUpdateInBackground` after refreshing the release cache.
 *      When a newer release matches the user's channel, it spawns a detached
 *      `__self-update-worker` process (same pattern as the analytics worker,
 *      so the download survives the short-lived CLI invocation). The worker
 *      downloads the platform zip, verifies it against checksums.txt
 *      (mandatory — unverifiable archives are never staged), extracts it, and
 *      atomically renames it into `staging/<version>/`, committing with a
 *      `staged.json` manifest at the staging root.
 *
 *   2. APPLY — a later CLI invocation runs `applyStagedUpdateAfterCommand`
 *      after command dispatch and error rendering have finished. If a valid
 *      staged version exists it transactionally swaps the install via
 *      `replaceBinary` (binary + run-companion modules + local-tools +
 *      release-tag.txt). The current process cannot load newly-installed
 *      companions after the swap; the new release serves the NEXT run.
 *
 * Guards (both halves): only first-party installs (release-tag.txt adjacent
 * to the executable), never when running via the bun/node runtime
 * (from-source/dev), and only when auto-update is enabled
 * (`COMPOSIO_NO_AUTOUPDATE` env wins over the `auto_update` user-config key).
 * Settings resolution fails closed: a present-but-unreadable config disables
 * auto-update rather than silently re-opting a user in.
 *
 * Visibility: a successful apply drops a marker file that the next decorated
 * (stderr-TTY) invocation prints once. The legacy stderr "Update available"
 * notice shows for opted-out users AND for enabled installs where
 * auto-update demonstrably cannot deliver (not first-party-resolvable, or
 * repeated stage failures for the same newer target).
 */

export const INTERNAL_SELF_UPDATE_WORKER_FLAG = '__self-update-worker';
export const INTERNAL_SKILL_REPIN_WORKER_FLAG = '__self-update-repin-worker';

const STAGING_DIRNAME = 'staging';
export const STAGED_MANIFEST_FILENAME = 'staged.json';
export const STAGE_ATTEMPT_FILENAME = 'stage-attempt.json';
export const STAGE_ATTEMPT_LOCK_FILENAME = 'stage-attempt.lock';
export const STAGE_ATTEMPT_INTERVAL_MS = 60 * 60 * 1000;
export const STAGE_FAILURE_NOTICE_THRESHOLD = 2;
export const AUTO_UPDATE_APPLIED_MARKER_FILENAME = 'auto-update-applied.json';

export type AutoUpdateChannel = 'stable' | 'beta';

export interface AutoUpdateSettings {
  readonly enabled: boolean;
  readonly channel: AutoUpdateChannel;
}

export const releaseChannelForVersion = (version: string): AutoUpdateChannel =>
  semver.prerelease(version) === null ? 'stable' : 'beta';

const DEFAULT_AUTO_UPDATE_SETTINGS: AutoUpdateSettings = {
  enabled: true,
  channel: 'stable',
};

const StagedUpdateManifest = Schema.Struct({
  releaseTag: Schema.String,
  version: Schema.String,
  channel: Schema.Literal('stable', 'beta'),
  fromVersion: Schema.String,
  stagedAt: Schema.String,
});
export type StagedUpdateManifest = typeof StagedUpdateManifest.Type;
const StagedUpdateManifestJson = Schema.parseJson(StagedUpdateManifest);

const StageAttemptJson = Schema.parseJson(
  Schema.Struct({
    lastAttempted: Schema.String,
    version: Schema.String,
    failedAttempts: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  })
);
type StageAttempt = Schema.Schema.Type<typeof StageAttemptJson>;

const AutoUpdateAppliedMarkerJson = Schema.parseJson(
  Schema.Struct({
    fromVersion: Schema.String,
    toVersion: Schema.String,
    appliedAt: Schema.String,
  })
);

const StageWorkerPayload = Schema.Struct({
  version: Schema.String,
  releaseTag: Schema.String,
  channel: Schema.Literal('stable', 'beta'),
  fromVersion: Schema.String,
});
export type StageWorkerPayload = typeof StageWorkerPayload.Type;
const StageWorkerPayloadJson = Schema.parseJson(StageWorkerPayload);

const SkillRepinWorkerPayloadJson = Schema.parseJson(
  Schema.Struct({
    releaseTag: Schema.String,
  })
);

const isTruthyFlag = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized !== '' && normalized !== '0' && normalized !== 'false';
};

// Unprefixed key: call sites wrap with the CLI's prefixed ConfigProvider,
// so this reads `COMPOSIO_NO_AUTOUPDATE` in every runtime.
const isAutoUpdateDisabledByEnv = Config.option(Config.string('NO_AUTOUPDATE')).pipe(
  Config.map(value =>
    Option.match(value, {
      onNone: () => false,
      onSome: isTruthyFlag,
    })
  ),
  Effect.orElseSucceed(() => false)
);

const DISABLED_AUTO_UPDATE_SETTINGS: AutoUpdateSettings = {
  enabled: false,
  channel: 'stable',
};

/**
 * An absent file is the default-on fresh install; a present-but-unreadable
 * file fails CLOSED — never re-opt-in a user whose opt-out became unreadable.
 */
export const readAutoUpdateSettingsFromFile = (
  configFilePath: string
): Effect.Effect<AutoUpdateSettings, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(configFilePath);
    if (!exists) {
      return DEFAULT_AUTO_UPDATE_SETTINGS;
    }
    const raw = yield* fs.readFileString(configFilePath, 'utf8');
    const parsed = yield* cliUserConfigFromJSON(raw);
    return {
      enabled: parsed.autoUpdate.enabled,
      channel: parsed.autoUpdate.channel,
    } satisfies AutoUpdateSettings;
  }).pipe(Effect.orElseSucceed(() => DISABLED_AUTO_UPDATE_SETTINGS));

export const resolveAutoUpdateSettings: Effect.Effect<
  AutoUpdateSettings,
  never,
  FileSystem.FileSystem | Path.Path | NodeOs
> = Effect.gen(function* () {
  if (yield* isAutoUpdateDisabledByEnv) {
    return DISABLED_AUTO_UPDATE_SETTINGS;
  }
  const configFilePath = yield* resolveCliConfigPath;
  return yield* readAutoUpdateSettingsFromFile(configFilePath);
}).pipe(Effect.orElseSucceed(() => DISABLED_AUTO_UPDATE_SETTINGS));

export interface FirstPartyInstall {
  readonly execPath: string;
  readonly installDir: string;
  readonly releaseTag: string;
  readonly currentVersion: string;
}

/**
 * release-tag.txt adjacent to the executable is written only by the installer
 * and upgrades — its presence marks a first-party install.
 */
export const resolveFirstPartyInstall = (options?: {
  readonly execPath?: string;
  readonly runtimePaths?: ReadonlyArray<string | null>;
}): Effect.Effect<Option.Option<FirstPartyInstall>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const execPath = options?.execPath ?? process.execPath;
    const runtimePaths = options?.runtimePaths ?? [Bun.which('bun'), Bun.which('node')];
    if (runtimePaths.includes(execPath)) {
      return Option.none();
    }
    const releaseTag = yield* readInstalledReleaseTag(execPath);
    if (!releaseTag) {
      return Option.none();
    }
    return Option.some({
      execPath,
      installDir: path.dirname(execPath),
      releaseTag,
      currentVersion: normalizeCliReleaseVersion(releaseTag),
    } satisfies FirstPartyInstall);
  }).pipe(Effect.orElseSucceed(() => Option.none<FirstPartyInstall>()));

export const resolveStagingRootDir: Effect.Effect<string, never, Path.Path | NodeOs> = Effect.gen(
  function* () {
    const path = yield* Path.Path;
    const os = yield* NodeOs;
    return path.join(os.homedir, constants.USER_COMPOSIO_DIR, STAGING_DIRNAME);
  }
);

export const resolveAppliedMarkerPath: Effect.Effect<string, never, Path.Path | NodeOs> =
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const os = yield* NodeOs;
    return path.join(os.homedir, constants.USER_COMPOSIO_DIR, AUTO_UPDATE_APPLIED_MARKER_FILENAME);
  });

const fileExists = (filePath: string) =>
  Effect.flatMap(FileSystem.FileSystem, fs =>
    fs.exists(filePath).pipe(Effect.orElseSucceed(() => false))
  );

const readJsonFile = <A>(schema: Schema.Schema<A, string>, filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const raw = yield* fs.readFileString(filePath, 'utf8');
    return yield* Schema.decode(schema)(raw);
  });

const writeJsonFile = <A>(schema: Schema.Schema<A, string>, filePath: string, value: A) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const encoded = yield* Schema.encode(schema)(value);
    const tempPath = `${filePath}.${crypto.randomUUID().slice(0, 8)}.tmp`;
    yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
    yield* fs.writeFileString(tempPath, encoded).pipe(
      Effect.andThen(fs.rename(tempPath, filePath)),
      Effect.tapError(() => fs.remove(tempPath, { force: true }).pipe(Effect.ignore))
    );
  });

export const readStagedManifest = (
  stagingRootDir: string
): Effect.Effect<Option.Option<StagedUpdateManifest>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const manifest = yield* readJsonFile(
      StagedUpdateManifestJson,
      path.join(stagingRootDir, STAGED_MANIFEST_FILENAME)
    );
    return Option.some(manifest);
  }).pipe(Effect.orElseSucceed(() => Option.none<StagedUpdateManifest>()));

const readStageAttempt = (stagingRootDir: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const attempt = yield* readJsonFile(
      StageAttemptJson,
      path.join(stagingRootDir, STAGE_ATTEMPT_FILENAME)
    );
    return Option.some(attempt);
  }).pipe(Effect.orElseSucceed(() => Option.none<StageAttempt>()));

const writeStageAttempt = (stagingRootDir: string, version: string, failedAttempts: number) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    yield* writeJsonFile(StageAttemptJson, path.join(stagingRootDir, STAGE_ATTEMPT_FILENAME), {
      lastAttempted: new Date().toISOString(),
      version,
      failedAttempts,
    });
  }).pipe(Effect.ignore);

const carriedFailedAttempts = (attempt: Option.Option<StageAttempt>, version: string): number => {
  if (Option.isSome(attempt) && attempt.value.version === version) {
    return attempt.value.failedAttempts;
  }
  return 0;
};

const refreshStageAttempt = (stagingRootDir: string, version: string) =>
  Effect.gen(function* () {
    const attempt = yield* readStageAttempt(stagingRootDir);
    yield* writeStageAttempt(stagingRootDir, version, carriedFailedAttempts(attempt, version));
  }).pipe(Effect.ignore);

const recordStageFailure = (stagingRootDir: string, version: string) =>
  Effect.gen(function* () {
    const attempt = yield* readStageAttempt(stagingRootDir);
    yield* writeStageAttempt(stagingRootDir, version, carriedFailedAttempts(attempt, version) + 1);
  }).pipe(Effect.ignore);

/**
 * Claimed before spawning so N concurrent parents spawn at most one worker
 * per backoff window: an exclusive-create (`wx`) lock file. A stale lock
 * (crashed claimer) is retired via rename, which only one contender can win.
 */
export const claimStageAttempt = (
  stagingRootDir: string,
  version: string
): Effect.Effect<boolean, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const lockPath = path.join(stagingRootDir, STAGE_ATTEMPT_LOCK_FILENAME);
    yield* fs.makeDirectory(stagingRootDir, { recursive: true });

    const lockInfo = yield* Effect.option(fs.stat(lockPath));
    if (Option.isSome(lockInfo)) {
      const lockedAtMs = Option.match(lockInfo.value.mtime, {
        onNone: () => undefined,
        onSome: (mtime: Date) => mtime.getTime(),
      });
      const lockIsFresh =
        lockedAtMs !== undefined && Date.now() - lockedAtMs < STAGE_ATTEMPT_INTERVAL_MS;
      if (lockIsFresh) {
        return false;
      }
      const retiredPath = `${lockPath}.${Math.random().toString(36).slice(2)}`;
      const retired = yield* Effect.option(fs.rename(lockPath, retiredPath));
      yield* fs.remove(retiredPath, { force: true }).pipe(Effect.ignore);
      if (Option.isNone(retired)) {
        return false;
      }
    }

    const locked = yield* Effect.scoped(fs.open(lockPath, { flag: 'wx' })).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false)
    );
    if (!locked) {
      return false;
    }

    yield* refreshStageAttempt(stagingRootDir, version);
    return true;
  }).pipe(Effect.orElseSucceed(() => false));

const releaseStageAttemptClaim = (stagingRootDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs
      .remove(path.join(stagingRootDir, STAGE_ATTEMPT_LOCK_FILENAME), { force: true })
      .pipe(Effect.ignore);
  });

// Semver ranks a stable release above its own prereleases, so a plain max
// also moves beta installs to the stable release once it ships.
export function pickAutoUpdateTarget(
  state: Pick<UpdateCheckState, 'latestVersion' | 'latestBeta'> | undefined,
  currentVersion: string,
  channel: AutoUpdateChannel
): { version: string; releaseTag: string } | undefined {
  if (!state || !semver.valid(currentVersion)) return undefined;

  const candidates: string[] = [];
  if (semver.valid(state.latestVersion) && semver.prerelease(state.latestVersion) === null) {
    candidates.push(state.latestVersion);
  }
  if (channel === 'beta' && state.latestBeta && semver.valid(state.latestBeta)) {
    candidates.push(state.latestBeta);
  }

  let best: string | undefined;
  for (const candidate of candidates) {
    if (!best || semver.gt(candidate, best)) {
      best = candidate;
    }
  }

  if (!best || !semver.gt(best, currentVersion)) return undefined;
  return { version: best, releaseTag: `@composio/cli@${best}` };
}

export const maybeStageUpdateInBackground = (
  state: Option.Option<Pick<UpdateCheckState, 'latestVersion' | 'latestBeta'>>
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path | NodeOs> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const settings = yield* resolveAutoUpdateSettings;
    if (!settings.enabled) return;

    const install = yield* resolveFirstPartyInstall();
    if (Option.isNone(install)) return;

    const target = pickAutoUpdateTarget(
      Option.getOrUndefined(state),
      install.value.currentVersion,
      settings.channel
    );
    if (!target) return;

    const stagingRootDir = yield* resolveStagingRootDir;

    const staged = yield* readStagedManifest(stagingRootDir);
    if (Option.isSome(staged) && staged.value.version === target.version) {
      const binaryStaged = yield* fileExists(
        path.join(stagingRootDir, target.version, CLI_BINARY_NAME)
      );
      if (binaryStaged) return;
    }

    const attempt = yield* readStageAttempt(stagingRootDir);
    if (Option.isSome(attempt) && attempt.value.version === target.version) {
      const lastAttemptedAt = new Date(attempt.value.lastAttempted).getTime();
      if (
        Number.isFinite(lastAttemptedAt) &&
        Date.now() - lastAttemptedAt < STAGE_ATTEMPT_INTERVAL_MS
      ) {
        return;
      }
    }

    const claimed = yield* claimStageAttempt(stagingRootDir, target.version);
    if (!claimed) return;

    const payload = yield* Schema.encode(StageWorkerPayloadJson)({
      version: target.version,
      releaseTag: target.releaseTag,
      channel: releaseChannelForVersion(target.version),
      fromVersion: install.value.currentVersion,
    });
    const { command, args } = yield* getWorkerSpawnArgs(
      INTERNAL_SELF_UPDATE_WORKER_FLAG,
      Encoding.encodeBase64Url(payload)
    );
    yield* spawnDetached(command, args).pipe(
      Effect.tapError(() =>
        recordStageFailure(stagingRootDir, target.version).pipe(
          Effect.andThen(releaseStageAttemptClaim(stagingRootDir))
        )
      )
    );
  }).pipe(
    Effect.withConfigProvider(extendConfigProvider(BaseConfigProviderLive)),
    Effect.catchAllCause(() => Effect.void)
  );

const pruneStagingRoot = (stagingRootDir: string, keepVersion: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const keep = new Set([
      keepVersion,
      STAGED_MANIFEST_FILENAME,
      STAGE_ATTEMPT_FILENAME,
      STAGE_ATTEMPT_LOCK_FILENAME,
    ]);
    const entries = yield* fs.readDirectory(stagingRootDir);
    for (const entry of entries) {
      if (keep.has(entry)) continue;
      yield* fs
        .remove(path.join(stagingRootDir, entry), { recursive: true, force: true })
        .pipe(Effect.ignore);
    }
  }).pipe(Effect.ignore);

/** Unlike the interactive upgrade, a missing checksums.txt entry aborts — a silent update must be verifiable. */
const stageRelease = (
  ctx: UpgradeBinaryContext,
  stagingRootDir: string,
  payload: StageWorkerPayload
) =>
  Effect.gen(function* () {
    const { fs, path } = ctx;
    const platformArch = yield* detectPlatform;
    const releaseByTag = yield* fetchCliReleaseByTag({
      githubConfig: ctx.githubConfig,
      httpClient: ctx.httpClient,
      tag: payload.releaseTag,
    });
    const release: GitHubRelease = {
      tag_name: payload.releaseTag,
      assets: releaseByTag.assets,
    };

    const { name, data } = yield* downloadBinary(ctx, release, platformArch);

    const checksums = yield* fetchChecksums(ctx, release);
    const expectedHash = Option.isSome(checksums) ? checksums.value.get(name) : undefined;
    if (!expectedHash) {
      return yield* Effect.fail(
        new UpgradeBinaryError({
          message: `No checksum available for ${name} in ${payload.releaseTag}; refusing to stage an unverified auto-update`,
        })
      );
    }
    yield* verifyChecksum(data, expectedHash, name);

    // Extract next to the final location so the commit rename stays on one
    // filesystem (atomic); commit content dir first, manifest last.
    const scratchDir = path.join(
      stagingRootDir,
      `.tmp-${payload.version}-${Math.random().toString(36).slice(2)}`
    );
    yield* fs
      .makeDirectory(scratchDir, { recursive: true })
      .pipe(
        Effect.mapError(
          cause => new UpgradeBinaryError({ cause, message: 'Failed to create staging directory' })
        )
      );

    yield* Effect.gen(function* () {
      const extracted = yield* extractBinary(ctx, { name, data }, scratchDir);
      const versionDir = path.join(stagingRootDir, payload.version);
      yield* fs.remove(versionDir, { recursive: true, force: true }).pipe(
        Effect.andThen(fs.rename(extracted.packageDir, versionDir)),
        Effect.mapError(
          cause =>
            new UpgradeBinaryError({ cause, message: 'Failed to commit staged update directory' })
        )
      );
      yield* writeJsonFile(
        StagedUpdateManifestJson,
        path.join(stagingRootDir, STAGED_MANIFEST_FILENAME),
        {
          releaseTag: payload.releaseTag,
          version: payload.version,
          channel: releaseChannelForVersion(payload.version),
          fromVersion: payload.fromVersion,
          stagedAt: new Date().toISOString(),
        }
      ).pipe(
        Effect.mapError(
          cause =>
            new UpgradeBinaryError({ cause, message: 'Failed to write staged update manifest' })
        )
      );
    }).pipe(
      Effect.ensuring(fs.remove(scratchDir, { recursive: true, force: true }).pipe(Effect.ignore))
    );

    yield* pruneStagingRoot(stagingRootDir, payload.version);
  });

export const isSelfUpdateWorkerInvocation = (argv: ReadonlyArray<string>): boolean =>
  argv.includes(INTERNAL_SELF_UPDATE_WORKER_FLAG);

export const isSkillRepinWorkerInvocation = (argv: ReadonlyArray<string>): boolean =>
  argv.includes(INTERNAL_SKILL_REPIN_WORKER_FLAG);

export const isStageWorkerPayloadAllowed = (
  payload: StageWorkerPayload,
  settings: AutoUpdateSettings,
  install: FirstPartyInstall
): boolean => {
  if (!settings.enabled || !semver.valid(payload.version)) return false;
  if (payload.releaseTag !== `@composio/cli@${payload.version}`) return false;
  const releaseChannel = releaseChannelForVersion(payload.version);
  if (payload.channel !== releaseChannel) return false;
  if (releaseChannel === 'beta' && settings.channel !== 'beta') return false;
  if (payload.fromVersion !== install.currentVersion) return false;
  return semver.gt(payload.version, install.currentVersion);
};

/** Detached-worker entry point. Re-validates every guard rather than trusting the spawn-time payload. */
export const runSelfUpdateWorkerFromArgv = (
  argv: ReadonlyArray<string>
): Effect.Effect<
  void,
  never,
  FileSystem.FileSystem | Path.Path | NodeOs | HttpClient.HttpClient | TerminalUI
> =>
  Effect.gen(function* () {
    const flagIndex = argv.indexOf(INTERNAL_SELF_UPDATE_WORKER_FLAG);
    const encodedPayload = argv[flagIndex + 1];
    if (!encodedPayload) return;

    const stagingRootDir = yield* resolveStagingRootDir;
    yield* Effect.gen(function* () {
      const payloadJson = yield* Encoding.decodeBase64UrlString(encodedPayload);
      const payload = yield* Schema.decode(StageWorkerPayloadJson)(payloadJson);

      const settings = yield* resolveAutoUpdateSettings;
      const install = yield* resolveFirstPartyInstall();
      if (
        Option.isNone(install) ||
        !isStageWorkerPayloadAllowed(payload, settings, install.value)
      ) {
        return;
      }

      yield* refreshStageAttempt(stagingRootDir, payload.version);

      const ctx: UpgradeBinaryContext = {
        httpClient: yield* HttpClient.HttpClient,
        fs: yield* FileSystem.FileSystem,
        path: yield* Path.Path,
        githubConfig: yield* Effect.orDie(Config.all(GITHUB_CONFIG)),
      };

      yield* stageRelease(ctx, stagingRootDir, payload).pipe(
        Effect.tap(() =>
          writeStageAttempt(stagingRootDir, payload.version, 0).pipe(
            Effect.andThen(
              trackCliEventEffect(
                getAutoUpdateStagedEvent({
                  fromVersion: install.value.currentVersion,
                  toVersion: payload.version,
                  channel: payload.channel,
                })
              )
            )
          )
        ),
        Effect.tapErrorCause(cause =>
          recordStageFailure(stagingRootDir, payload.version).pipe(
            Effect.andThen(
              trackCliEventEffect(
                getAutoUpdateFailedEvent({
                  fromVersion: install.value.currentVersion,
                  toVersion: payload.version,
                  channel: payload.channel,
                  phase: 'stage',
                  error: Cause.squash(cause),
                })
              )
            )
          )
        )
      );
    });
  }).pipe(
    Effect.withConfigProvider(extendConfigProvider(BaseConfigProviderLive)),
    Effect.catchAllCause(() => Effect.void)
  );

export interface ValidStagedUpdate {
  readonly manifest: StagedUpdateManifest;
  readonly binaryPath: string;
}

/** Anything stale or inconsistent tears down the staging directory and reports none. */
export const readValidStagedUpdate = (options: {
  readonly stagingRootDir: string;
  readonly currentVersion: string;
  readonly channel: AutoUpdateChannel;
}): Effect.Effect<Option.Option<ValidStagedUpdate>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { stagingRootDir, currentVersion, channel } = options;

    const manifest = yield* readStagedManifest(stagingRootDir);
    if (Option.isNone(manifest)) return Option.none<ValidStagedUpdate>();

    const staged = manifest.value;
    const binaryPath = path.join(stagingRootDir, staged.version, CLI_BINARY_NAME);
    const isValid =
      semver.valid(staged.version) !== null &&
      semver.valid(currentVersion) !== null &&
      semver.gt(staged.version, currentVersion) &&
      staged.releaseTag === `@composio/cli@${staged.version}` &&
      staged.channel === releaseChannelForVersion(staged.version) &&
      (staged.channel !== 'beta' || channel === 'beta') &&
      (yield* fileExists(binaryPath));

    if (!isValid) {
      yield* fs.remove(stagingRootDir, { recursive: true, force: true }).pipe(Effect.ignore);
      return Option.none<ValidStagedUpdate>();
    }

    return Option.some({ manifest: staged, binaryPath } satisfies ValidStagedUpdate);
  }).pipe(Effect.orElseSucceed(() => Option.none<ValidStagedUpdate>()));

/**
 * The staging directory is removed on failure too, so a broken artifact
 * cannot retry on every startup — the background check re-stages on its own
 * cadence.
 */
export const applyStagedUpdateCore = (options: {
  readonly stagingRootDir: string;
  readonly install: FirstPartyInstall;
  readonly channel: AutoUpdateChannel;
  readonly markerFilePath: string;
  readonly replace: (
    sourceBinaryPath: string,
    targetPath: string,
    releaseTag: string
  ) => Effect.Effect<void, unknown, never>;
  readonly scheduleSkillRepin: (releaseTag: string) => Effect.Effect<void, never, never>;
  readonly track: (event: TrackEvent) => Effect.Effect<void, never, never>;
}): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { stagingRootDir, install, channel, markerFilePath, replace, scheduleSkillRepin, track } =
      options;

    const staged = yield* readValidStagedUpdate({
      stagingRootDir,
      currentVersion: install.currentVersion,
      channel,
    });
    if (Option.isNone(staged)) return;

    // Claim the manifest with an atomic rename so concurrent invocations
    // cannot both rewrite the installed binary; only the winner proceeds.
    const path = yield* Path.Path;
    const claimed = yield* fs
      .rename(
        path.join(stagingRootDir, STAGED_MANIFEST_FILENAME),
        path.join(stagingRootDir, `${STAGED_MANIFEST_FILENAME}.applying`)
      )
      .pipe(Effect.option);
    if (Option.isNone(claimed)) return;

    const { manifest, binaryPath } = staged.value;
    const eventParams = {
      fromVersion: install.currentVersion,
      toVersion: manifest.version,
      channel: manifest.channel,
    };

    const writeAppliedMarker = writeJsonFile(AutoUpdateAppliedMarkerJson, markerFilePath, {
      fromVersion: install.currentVersion,
      toVersion: manifest.version,
      appliedAt: new Date().toISOString(),
    }).pipe(Effect.ignore);

    yield* replace(binaryPath, install.execPath, manifest.releaseTag).pipe(
      Effect.matchCauseEffect({
        onSuccess: () =>
          writeAppliedMarker.pipe(
            Effect.andThen(track(getAutoUpdateAppliedEvent(eventParams))),
            Effect.andThen(scheduleSkillRepin(manifest.releaseTag))
          ),
        onFailure: cause =>
          track(
            getAutoUpdateFailedEvent({
              ...eventParams,
              phase: 'apply',
              error: Cause.squash(cause),
            })
          ),
      })
    );

    yield* fs.remove(stagingRootDir, { recursive: true, force: true }).pipe(Effect.ignore);
  }).pipe(Effect.catchAllCause(() => Effect.void));

export const showAutoUpdateAppliedNoticeCore = (options: {
  readonly markerFilePath: string;
  readonly terminal: Pick<TerminalUI, 'capabilities' | 'error'>;
}): Effect.Effect<void, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { markerFilePath, terminal } = options;
    if (!(yield* fileExists(markerFilePath))) return;

    const clearMarker = fs.remove(markerFilePath, { force: true }).pipe(Effect.ignore);
    const marker = yield* Effect.option(readJsonFile(AutoUpdateAppliedMarkerJson, markerFilePath));
    if (Option.isNone(marker)) {
      yield* clearMarker;
      return;
    }

    const { canDecorate } = yield* terminal.capabilities;
    if (!canDecorate) return;

    const { fromVersion, toVersion } = marker.value;
    yield* terminal.error(
      `${dim('composio auto-updated')} ${dim(fromVersion)} ${dim('→')} ${bold(cyanBright(toVersion))} ${dim('(composio config auto-update off to disable)')}`
    );
    yield* clearMarker;
  }).pipe(Effect.catchAllCause(() => Effect.void));

export const shouldShowUpdateNoticeCore = (options: {
  readonly settings: AutoUpdateSettings;
  readonly install: Option.Option<FirstPartyInstall>;
  readonly stagingRootDir: string;
}): Effect.Effect<boolean, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const { settings, install, stagingRootDir } = options;
    if (!settings.enabled) return true;
    if (Option.isNone(install)) return true;

    const attempt = yield* readStageAttempt(stagingRootDir);
    if (Option.isNone(attempt)) return false;
    const { version, failedAttempts } = attempt.value;
    if (failedAttempts < STAGE_FAILURE_NOTICE_THRESHOLD) return false;
    if (semver.valid(version) === null) return false;
    if (semver.valid(install.value.currentVersion) === null) return false;
    return semver.gt(version, install.value.currentVersion);
  }).pipe(Effect.orElseSucceed(() => false));

const SelfUpdateLayers = Layer.mergeAll(
  BunFileSystem.layer,
  Path.layer,
  NodeOs.Default,
  FetchHttpClient.layer,
  TerminalUILive
);

export const shouldShowUpdateNoticeAtStartup: Effect.Effect<boolean> = Effect.gen(function* () {
  const settings = yield* resolveAutoUpdateSettings;
  const install = yield* resolveFirstPartyInstall();
  const stagingRootDir = yield* resolveStagingRootDir;
  return yield* shouldShowUpdateNoticeCore({ settings, install, stagingRootDir });
}).pipe(
  Effect.withConfigProvider(extendConfigProvider(BaseConfigProviderLive)),
  Effect.provide(SelfUpdateLayers),
  Effect.orElseSucceed(() => true)
);

export const showAutoUpdateAppliedNoticeAtStartup: Effect.Effect<void> = Effect.gen(function* () {
  const terminal = yield* TerminalUI;
  const markerFilePath = yield* resolveAppliedMarkerPath;
  yield* showAutoUpdateAppliedNoticeCore({ markerFilePath, terminal });
}).pipe(
  Effect.provide(SelfUpdateLayers),
  Effect.catchAllCause(() => Effect.void)
);

const repinInstalledSkill = (releaseTag: string) =>
  Effect.gen(function* () {
    const os = yield* NodeOs;
    const path = yield* Path.Path;
    const skillDir = path.join(os.homedir, '.agents', 'skills', 'composio-cli');
    if (!(yield* fileExists(skillDir))) return;
    yield* installSkill({ releaseTag, silent: true });
  }).pipe(Effect.catchAllCause(() => Effect.void));

const scheduleInstalledSkillRepin = (releaseTag: string) =>
  Effect.gen(function* () {
    const payload = yield* Schema.encode(SkillRepinWorkerPayloadJson)({ releaseTag });
    const { command, args } = yield* getWorkerSpawnArgs(
      INTERNAL_SKILL_REPIN_WORKER_FLAG,
      Encoding.encodeBase64Url(payload)
    );
    yield* spawnDetached(command, args);
  }).pipe(Effect.catchAllCause(() => Effect.void));

export const runSkillRepinWorkerFromArgv = (
  argv: ReadonlyArray<string>
): Effect.Effect<
  void,
  never,
  FileSystem.FileSystem | Path.Path | NodeOs | HttpClient.HttpClient | TerminalUI
> =>
  Effect.gen(function* () {
    const flagIndex = argv.indexOf(INTERNAL_SKILL_REPIN_WORKER_FLAG);
    const encodedPayload = argv[flagIndex + 1];
    if (!encodedPayload) return;
    const payloadJson = yield* Encoding.decodeBase64UrlString(encodedPayload);
    const payload = yield* Schema.decode(SkillRepinWorkerPayloadJson)(payloadJson);
    const install = yield* resolveFirstPartyInstall();
    if (Option.isNone(install) || install.value.releaseTag !== payload.releaseTag) return;
    yield* repinInstalledSkill(payload.releaseTag);
  }).pipe(
    Effect.withConfigProvider(extendConfigProvider(BaseConfigProviderLive)),
    Effect.catchAllCause(() => Effect.void)
  );

export const applyStagedUpdateAfterCommand: Effect.Effect<void> = Effect.gen(function* () {
  const settings = yield* resolveAutoUpdateSettings;
  if (!settings.enabled) return;

  const install = yield* resolveFirstPartyInstall();
  if (Option.isNone(install)) return;

  const stagingRootDir = yield* resolveStagingRootDir;
  if (!(yield* fileExists(stagingRootDir))) return;

  const ctx: UpgradeBinaryContext = {
    httpClient: yield* HttpClient.HttpClient,
    fs: yield* FileSystem.FileSystem,
    path: yield* Path.Path,
    githubConfig: yield* Effect.orDie(Config.all(GITHUB_CONFIG)),
  };

  yield* applyStagedUpdateCore({
    stagingRootDir,
    install: install.value,
    channel: settings.channel,
    markerFilePath: yield* resolveAppliedMarkerPath,
    replace: (sourceBinaryPath, targetPath, releaseTag) =>
      replaceBinary(ctx, sourceBinaryPath, targetPath, { releaseTag }),
    scheduleSkillRepin: releaseTag =>
      scheduleInstalledSkillRepin(releaseTag).pipe(Effect.provide(SelfUpdateLayers)),
    track: event => trackCliEventEffect(event).pipe(Effect.provide(SelfUpdateLayers)),
  });
}).pipe(
  Effect.withConfigProvider(extendConfigProvider(BaseConfigProviderLive)),
  Effect.provide(SelfUpdateLayers),
  Effect.catchAllCause(() => Effect.void)
);
