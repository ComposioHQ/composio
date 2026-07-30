import { describe, it, expect } from '@effect/vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, afterEach } from 'vitest';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { ConfigProvider, Effect, Layer, Option } from 'effect';
import type { TrackEvent } from 'src/analytics/types';
import {
  applyStagedUpdateCore,
  claimStageAttempt,
  pickAutoUpdateTarget,
  readAutoUpdateSettingsFromFile,
  readStagedManifest,
  readValidStagedUpdate,
  releaseChannelForVersion,
  resolveAutoUpdateSettings,
  resolveFirstPartyInstall,
  shouldShowUpdateNoticeCore,
  showAutoUpdateAppliedNoticeCore,
  AUTO_UPDATE_APPLIED_MARKER_FILENAME,
  STAGE_ATTEMPT_FILENAME,
  STAGE_ATTEMPT_LOCK_FILENAME,
  STAGED_MANIFEST_FILENAME,
  type AutoUpdateSettings,
  type FirstPartyInstall,
  type StagedUpdateManifest,
} from 'src/services/self-update';
import { getTerminalCapabilities, type TerminalUI } from 'src/services/terminal-ui';
import { NodeOs, defaultNodeOs } from 'src/services/node-os';

const PlatformLayers = Layer.mergeAll(BunFileSystem.layer, BunPath.layer);

let tempDir: string;
beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'self-update-test-'));
});
afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const writeManifest = (stagingRootDir: string, manifest: StagedUpdateManifest): void => {
  mkdirSync(stagingRootDir, { recursive: true });
  writeFileSync(join(stagingRootDir, STAGED_MANIFEST_FILENAME), JSON.stringify(manifest));
};

const makeManifest = (overrides?: Partial<StagedUpdateManifest>): StagedUpdateManifest => ({
  releaseTag: '@composio/cli@0.3.0',
  version: '0.3.0',
  channel: 'stable',
  fromVersion: '0.2.0',
  stagedAt: new Date().toISOString(),
  ...overrides,
});

const stageBinary = (stagingRootDir: string, version: string): string => {
  const versionDir = join(stagingRootDir, version);
  mkdirSync(versionDir, { recursive: true });
  const binaryPath = join(versionDir, 'composio');
  writeFileSync(binaryPath, 'fake-binary');
  return binaryPath;
};

describe('pickAutoUpdateTarget', () => {
  it('returns undefined without cached state', () => {
    expect(pickAutoUpdateTarget(undefined, '0.2.0', 'stable')).toBeUndefined();
  });

  it('targets a newer stable on the stable channel', () => {
    expect(pickAutoUpdateTarget({ latestVersion: '0.3.0' }, '0.2.0', 'stable')).toEqual({
      version: '0.3.0',
      releaseTag: '@composio/cli@0.3.0',
    });
  });

  it('returns undefined when already up to date', () => {
    expect(pickAutoUpdateTarget({ latestVersion: '0.2.0' }, '0.2.0', 'stable')).toBeUndefined();
    expect(pickAutoUpdateTarget({ latestVersion: '0.1.0' }, '0.2.0', 'stable')).toBeUndefined();
  });

  it('ignores a newer beta on the stable channel', () => {
    expect(
      pickAutoUpdateTarget(
        { latestVersion: '0.2.0', latestBeta: '0.3.0-beta.1' },
        '0.2.0',
        'stable'
      )
    ).toBeUndefined();
  });

  it('targets a newer beta on the beta channel', () => {
    expect(
      pickAutoUpdateTarget({ latestVersion: '0.2.0', latestBeta: '0.3.0-beta.1' }, '0.2.0', 'beta')
    ).toEqual({
      version: '0.3.0-beta.1',
      releaseTag: '@composio/cli@0.3.0-beta.1',
    });
  });

  it('moves a beta build forward to a newer beta', () => {
    expect(
      pickAutoUpdateTarget(
        { latestVersion: '0.2.0', latestBeta: '0.3.0-beta.2' },
        '0.3.0-beta.1',
        'beta'
      )
    ).toEqual({
      version: '0.3.0-beta.2',
      releaseTag: '@composio/cli@0.3.0-beta.2',
    });
  });

  it('prefers the stable release when it outranks the beta on the beta channel', () => {
    expect(
      pickAutoUpdateTarget(
        { latestVersion: '0.3.0', latestBeta: '0.3.0-beta.5' },
        '0.3.0-beta.5',
        'beta'
      )
    ).toEqual({
      version: '0.3.0',
      releaseTag: '@composio/cli@0.3.0',
    });
  });

  it('never selects a prerelease that leaked into latestVersion', () => {
    expect(
      pickAutoUpdateTarget({ latestVersion: '0.3.0-beta.1' }, '0.2.0', 'stable')
    ).toBeUndefined();
  });

  it('returns undefined for an invalid installed version', () => {
    expect(pickAutoUpdateTarget({ latestVersion: '0.3.0' }, 'garbage', 'stable')).toBeUndefined();
  });
});

describe('releaseChannelForVersion', () => {
  it('records the release channel, not the staging user preference', () => {
    expect(releaseChannelForVersion('0.3.0')).toBe('stable');
    expect(releaseChannelForVersion('0.3.0-beta.1')).toBe('beta');
  });
});

describe('readAutoUpdateSettingsFromFile', () => {
  it.effect('defaults to enabled/stable when the file is missing', () =>
    Effect.gen(function* () {
      const settings = yield* readAutoUpdateSettingsFromFile(join(tempDir, 'config.json'));
      expect(settings).toEqual({ enabled: true, channel: 'stable' });
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('reads an explicit opt-out', () =>
    Effect.gen(function* () {
      const configPath = join(tempDir, 'config.json');
      writeFileSync(configPath, JSON.stringify({ auto_update: { enabled: false } }));
      const settings = yield* readAutoUpdateSettingsFromFile(configPath);
      expect(settings).toEqual({ enabled: false, channel: 'stable' });
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('reads the beta channel opt-in', () =>
    Effect.gen(function* () {
      const configPath = join(tempDir, 'config.json');
      writeFileSync(configPath, JSON.stringify({ auto_update: { channel: 'beta' } }));
      const settings = yield* readAutoUpdateSettingsFromFile(configPath);
      expect(settings).toEqual({ enabled: true, channel: 'beta' });
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('fails closed to disabled on a corrupt file', () =>
    Effect.gen(function* () {
      const configPath = join(tempDir, 'config.json');
      writeFileSync(configPath, 'not-json!!!');
      const settings = yield* readAutoUpdateSettingsFromFile(configPath);
      expect(settings).toEqual({ enabled: false, channel: 'stable' });
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('fails closed to disabled on an unreadable file', () =>
    Effect.gen(function* () {
      const configPath = join(tempDir, 'config.json');
      mkdirSync(configPath, { recursive: true });
      const settings = yield* readAutoUpdateSettingsFromFile(configPath);
      expect(settings).toEqual({ enabled: false, channel: 'stable' });
    }).pipe(Effect.provide(PlatformLayers))
  );
});

describe('resolveAutoUpdateSettings', () => {
  const settingsLayers = () =>
    Layer.mergeAll(PlatformLayers, Layer.succeed(NodeOs, defaultNodeOs({ homedir: tempDir })));

  const withEnv = (entries: Record<string, string>) =>
    Effect.withConfigProvider(
      // CACHE_DIR points the config path at the temp dir; the prefix mapping
      // is applied by production call sites, so keys here are unprefixed.
      ConfigProvider.fromMap(new Map(Object.entries({ CACHE_DIR: tempDir, ...entries })))
    );

  it.effect('honors the COMPOSIO_NO_AUTOUPDATE kill-switch over the config file', () =>
    Effect.gen(function* () {
      writeFileSync(
        join(tempDir, 'config.json'),
        JSON.stringify({ auto_update: { enabled: true, channel: 'beta' } })
      );
      const settings = yield* resolveAutoUpdateSettings;
      expect(settings.enabled).toBe(false);
    }).pipe(withEnv({ NO_AUTOUPDATE: '1' }), Effect.provide(settingsLayers()))
  );

  it.effect('treats NO_AUTOUPDATE=0 as not opted out', () =>
    Effect.gen(function* () {
      const settings = yield* resolveAutoUpdateSettings;
      expect(settings.enabled).toBe(true);
    }).pipe(withEnv({ NO_AUTOUPDATE: '0' }), Effect.provide(settingsLayers()))
  );

  it.effect('reads the persisted config when the env is unset', () =>
    Effect.gen(function* () {
      writeFileSync(
        join(tempDir, 'config.json'),
        JSON.stringify({ auto_update: { enabled: false } })
      );
      const settings = yield* resolveAutoUpdateSettings;
      expect(settings).toEqual({ enabled: false, channel: 'stable' });
    }).pipe(withEnv({}), Effect.provide(settingsLayers()))
  );

  it.effect('stays enabled for a genuinely fresh install (no config file)', () =>
    Effect.gen(function* () {
      const settings = yield* resolveAutoUpdateSettings;
      expect(settings).toEqual({ enabled: true, channel: 'stable' });
    }).pipe(withEnv({}), Effect.provide(settingsLayers()))
  );

  it.effect('fails closed to disabled when the config file is unreadable', () =>
    Effect.gen(function* () {
      mkdirSync(join(tempDir, 'config.json'), { recursive: true });
      const settings = yield* resolveAutoUpdateSettings;
      expect(settings).toEqual({ enabled: false, channel: 'stable' });
    }).pipe(withEnv({}), Effect.provide(settingsLayers()))
  );
});

describe('resolveFirstPartyInstall', () => {
  it.effect('rejects runs through the bun or node runtime', () =>
    Effect.gen(function* () {
      const runtimePath = join(tempDir, 'bun');
      const install = yield* resolveFirstPartyInstall({
        execPath: runtimePath,
        runtimePaths: [runtimePath, null],
      });
      expect(Option.isNone(install)).toBe(true);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('rejects binaries without an adjacent release-tag.txt', () =>
    Effect.gen(function* () {
      const execPath = join(tempDir, 'composio');
      writeFileSync(execPath, 'binary');
      const install = yield* resolveFirstPartyInstall({ execPath, runtimePaths: [] });
      expect(Option.isNone(install)).toBe(true);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('accepts a first-party install and normalizes the version', () =>
    Effect.gen(function* () {
      const execPath = join(tempDir, 'composio');
      writeFileSync(execPath, 'binary');
      writeFileSync(join(tempDir, 'release-tag.txt'), '@composio/cli@0.2.0\n');
      const install = yield* resolveFirstPartyInstall({ execPath, runtimePaths: [] });
      expect(Option.isSome(install)).toBe(true);
      if (Option.isSome(install)) {
        expect(install.value).toEqual({
          execPath,
          installDir: tempDir,
          releaseTag: '@composio/cli@0.2.0',
          currentVersion: '0.2.0',
        });
      }
    }).pipe(Effect.provide(PlatformLayers))
  );
});

describe('readValidStagedUpdate', () => {
  let stagingRootDir: string;
  beforeEach(() => {
    stagingRootDir = join(tempDir, 'staging');
  });

  it.effect('reports none without a manifest', () =>
    Effect.gen(function* () {
      const staged = yield* readValidStagedUpdate({
        stagingRootDir,
        currentVersion: '0.2.0',
        channel: 'stable',
      });
      expect(Option.isNone(staged)).toBe(true);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('accepts a staged newer version with its binary', () =>
    Effect.gen(function* () {
      writeManifest(stagingRootDir, makeManifest());
      const binaryPath = stageBinary(stagingRootDir, '0.3.0');
      const staged = yield* readValidStagedUpdate({
        stagingRootDir,
        currentVersion: '0.2.0',
        channel: 'stable',
      });
      expect(Option.isSome(staged)).toBe(true);
      if (Option.isSome(staged)) {
        expect(staged.value.binaryPath).toBe(binaryPath);
        expect(staged.value.manifest.releaseTag).toBe('@composio/cli@0.3.0');
      }
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('discards an already-applied version and clears the staging dir', () =>
    Effect.gen(function* () {
      writeManifest(stagingRootDir, makeManifest());
      stageBinary(stagingRootDir, '0.3.0');
      const staged = yield* readValidStagedUpdate({
        stagingRootDir,
        currentVersion: '0.3.0',
        channel: 'stable',
      });
      expect(Option.isNone(staged)).toBe(true);
      expect(existsSync(stagingRootDir)).toBe(false);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('discards a staged beta when the channel is stable', () =>
    Effect.gen(function* () {
      writeManifest(
        stagingRootDir,
        makeManifest({
          releaseTag: '@composio/cli@0.3.0-beta.1',
          version: '0.3.0-beta.1',
          channel: 'beta',
        })
      );
      stageBinary(stagingRootDir, '0.3.0-beta.1');
      const staged = yield* readValidStagedUpdate({
        stagingRootDir,
        currentVersion: '0.2.0',
        channel: 'stable',
      });
      expect(Option.isNone(staged)).toBe(true);
      expect(existsSync(stagingRootDir)).toBe(false);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('applies a staged beta when the channel is beta', () =>
    Effect.gen(function* () {
      writeManifest(
        stagingRootDir,
        makeManifest({
          releaseTag: '@composio/cli@0.3.0-beta.1',
          version: '0.3.0-beta.1',
          channel: 'beta',
        })
      );
      stageBinary(stagingRootDir, '0.3.0-beta.1');
      const staged = yield* readValidStagedUpdate({
        stagingRootDir,
        currentVersion: '0.2.0',
        channel: 'beta',
      });
      expect(Option.isSome(staged)).toBe(true);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('discards a manifest whose staged binary is missing', () =>
    Effect.gen(function* () {
      writeManifest(stagingRootDir, makeManifest());
      const staged = yield* readValidStagedUpdate({
        stagingRootDir,
        currentVersion: '0.2.0',
        channel: 'stable',
      });
      expect(Option.isNone(staged)).toBe(true);
      expect(existsSync(stagingRootDir)).toBe(false);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('discards a corrupt manifest without failing', () =>
    Effect.gen(function* () {
      mkdirSync(stagingRootDir, { recursive: true });
      writeFileSync(join(stagingRootDir, STAGED_MANIFEST_FILENAME), 'garbage');
      const staged = yield* readValidStagedUpdate({
        stagingRootDir,
        currentVersion: '0.2.0',
        channel: 'stable',
      });
      expect(Option.isNone(staged)).toBe(true);
    }).pipe(Effect.provide(PlatformLayers))
  );
});

describe('applyStagedUpdateCore', () => {
  let stagingRootDir: string;
  let markerFilePath: string;
  let install: FirstPartyInstall;
  let tracked: TrackEvent[];
  let replaceCalls: Array<{ source: string; target: string; releaseTag: string }>;
  let repinned: string[];

  beforeEach(() => {
    stagingRootDir = join(tempDir, 'staging');
    markerFilePath = join(tempDir, AUTO_UPDATE_APPLIED_MARKER_FILENAME);
    install = {
      execPath: join(tempDir, 'install', 'composio'),
      installDir: join(tempDir, 'install'),
      releaseTag: '@composio/cli@0.2.0',
      currentVersion: '0.2.0',
    };
    tracked = [];
    replaceCalls = [];
    repinned = [];
  });

  const track = (event: TrackEvent) =>
    Effect.sync(() => {
      tracked.push(event);
    });

  const repinSkill = (releaseTag: string) =>
    Effect.sync(() => {
      repinned.push(releaseTag);
    });

  const succeedingReplace = (source: string, target: string, releaseTag: string) =>
    Effect.sync(() => {
      replaceCalls.push({ source, target, releaseTag });
    });

  it.effect('swaps, writes the applied marker, tracks, re-pins the skill, and cleans up', () =>
    Effect.gen(function* () {
      writeManifest(stagingRootDir, makeManifest());
      const binaryPath = stageBinary(stagingRootDir, '0.3.0');

      yield* applyStagedUpdateCore({
        stagingRootDir,
        markerFilePath,
        install,
        channel: 'stable',
        replace: succeedingReplace,
        repinSkill,
        track,
      });

      expect(replaceCalls).toEqual([
        { source: binaryPath, target: install.execPath, releaseTag: '@composio/cli@0.3.0' },
      ]);
      expect(tracked.map(event => event?.name)).toEqual(['CLI_AUTO_UPDATE_APPLIED']);
      expect(tracked[0]?.properties).toMatchObject({
        from_version: '0.2.0',
        to_version: '0.3.0',
        channel: 'stable',
      });
      expect(repinned).toEqual(['@composio/cli@0.3.0']);
      expect(existsSync(stagingRootDir)).toBe(false);
      expect(JSON.parse(readFileSync(markerFilePath, 'utf8'))).toMatchObject({
        fromVersion: '0.2.0',
        toVersion: '0.3.0',
      });
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('tracks a failed apply, writes no marker, skips the re-pin, and still cleans up', () =>
    Effect.gen(function* () {
      writeManifest(stagingRootDir, makeManifest());
      stageBinary(stagingRootDir, '0.3.0');

      yield* applyStagedUpdateCore({
        stagingRootDir,
        markerFilePath,
        install,
        channel: 'stable',
        replace: () => Effect.fail(new Error('EACCES')),
        repinSkill,
        track,
      });

      expect(tracked.map(event => event?.name)).toEqual(['CLI_AUTO_UPDATE_FAILED']);
      expect(tracked[0]?.properties).toMatchObject({
        phase: 'apply',
        from_version: '0.2.0',
        to_version: '0.3.0',
      });
      expect(repinned).toEqual([]);
      expect(existsSync(stagingRootDir)).toBe(false);
      expect(existsSync(markerFilePath)).toBe(false);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('does nothing when no update is staged', () =>
    Effect.gen(function* () {
      yield* applyStagedUpdateCore({
        stagingRootDir,
        markerFilePath,
        install,
        channel: 'stable',
        replace: succeedingReplace,
        repinSkill,
        track,
      });

      expect(replaceCalls).toEqual([]);
      expect(tracked).toEqual([]);
      expect(repinned).toEqual([]);
      expect(existsSync(markerFilePath)).toBe(false);
    }).pipe(Effect.provide(PlatformLayers))
  );
});

describe('readStagedManifest', () => {
  it.effect('round-trips a staged manifest', () =>
    Effect.gen(function* () {
      const stagingRootDir = join(tempDir, 'staging');
      const manifest = makeManifest({ channel: 'beta' });
      writeManifest(stagingRootDir, manifest);
      const read = yield* readStagedManifest(stagingRootDir);
      expect(Option.getOrUndefined(read)).toEqual(manifest);
    }).pipe(Effect.provide(PlatformLayers))
  );
});

const writeAttemptFile = (
  stagingRootDir: string,
  attempt: { version: string; lastAttempted?: string; failedAttempts?: number }
): void => {
  mkdirSync(stagingRootDir, { recursive: true });
  writeFileSync(
    join(stagingRootDir, STAGE_ATTEMPT_FILENAME),
    JSON.stringify({ lastAttempted: new Date().toISOString(), ...attempt })
  );
};

describe('claimStageAttempt', () => {
  let stagingRootDir: string;
  beforeEach(() => {
    stagingRootDir = join(tempDir, 'staging');
  });

  it.effect('claims a fresh window and records the attempt', () =>
    Effect.gen(function* () {
      const claimed = yield* claimStageAttempt(stagingRootDir, '0.3.0');
      expect(claimed).toBe(true);
      expect(existsSync(join(stagingRootDir, STAGE_ATTEMPT_LOCK_FILENAME))).toBe(true);
      const attempt = JSON.parse(
        readFileSync(join(stagingRootDir, STAGE_ATTEMPT_FILENAME), 'utf8')
      );
      expect(attempt).toMatchObject({ version: '0.3.0', failedAttempts: 0 });
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('rejects further claims within the same backoff window', () =>
    Effect.gen(function* () {
      expect(yield* claimStageAttempt(stagingRootDir, '0.3.0')).toBe(true);
      expect(yield* claimStageAttempt(stagingRootDir, '0.3.0')).toBe(false);
      expect(yield* claimStageAttempt(stagingRootDir, '0.4.0')).toBe(false);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('lets exactly one of many concurrent parents claim the window', () =>
    Effect.gen(function* () {
      const results = yield* Effect.all(
        Array.from({ length: 8 }, () => claimStageAttempt(stagingRootDir, '0.3.0')),
        { concurrency: 'unbounded' }
      );
      expect(results.filter(claimed => claimed)).toHaveLength(1);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('carries the failure count for the same target across claims', () =>
    Effect.gen(function* () {
      writeAttemptFile(stagingRootDir, { version: '0.3.0', failedAttempts: 3 });
      const claimed = yield* claimStageAttempt(stagingRootDir, '0.3.0');
      expect(claimed).toBe(true);
      const attempt = JSON.parse(
        readFileSync(join(stagingRootDir, STAGE_ATTEMPT_FILENAME), 'utf8')
      );
      expect(attempt).toMatchObject({ version: '0.3.0', failedAttempts: 3 });
    }).pipe(Effect.provide(PlatformLayers))
  );
});

const makeCaptureTerminal = (
  stderrIsTTY: boolean
): { terminal: Pick<TerminalUI, 'capabilities' | 'error'>; lines: string[] } => {
  const lines: string[] = [];
  return {
    lines,
    terminal: {
      capabilities: Effect.succeed(
        getTerminalCapabilities({
          stdin: { isTTY: false },
          stdout: { isTTY: false },
          stderr: { isTTY: stderrIsTTY },
        })
      ),
      error: (data: string) =>
        Effect.sync(() => {
          lines.push(data);
        }),
    },
  };
};

describe('showAutoUpdateAppliedNoticeCore', () => {
  let markerFilePath: string;
  beforeEach(() => {
    markerFilePath = join(tempDir, AUTO_UPDATE_APPLIED_MARKER_FILENAME);
  });

  const writeMarker = (): void => {
    writeFileSync(
      markerFilePath,
      JSON.stringify({
        fromVersion: '0.2.0',
        toVersion: '0.3.0',
        appliedAt: new Date().toISOString(),
      })
    );
  };

  it.effect('prints one line and clears the marker on a decorated invocation', () =>
    Effect.gen(function* () {
      writeMarker();
      const { terminal, lines } = makeCaptureTerminal(true);
      yield* showAutoUpdateAppliedNoticeCore({ markerFilePath, terminal });
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('0.2.0');
      expect(lines[0]).toContain('0.3.0');
      expect(lines[0]).toContain('composio config auto-update off');
      expect(existsSync(markerFilePath)).toBe(false);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('leaves the marker for the next decorated invocation when stderr is piped', () =>
    Effect.gen(function* () {
      writeMarker();
      const { terminal, lines } = makeCaptureTerminal(false);
      yield* showAutoUpdateAppliedNoticeCore({ markerFilePath, terminal });
      expect(lines).toEqual([]);
      expect(existsSync(markerFilePath)).toBe(true);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('does nothing without a marker', () =>
    Effect.gen(function* () {
      const { terminal, lines } = makeCaptureTerminal(true);
      yield* showAutoUpdateAppliedNoticeCore({ markerFilePath, terminal });
      expect(lines).toEqual([]);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('clears a corrupt marker without printing', () =>
    Effect.gen(function* () {
      writeFileSync(markerFilePath, 'garbage');
      const { terminal, lines } = makeCaptureTerminal(true);
      yield* showAutoUpdateAppliedNoticeCore({ markerFilePath, terminal });
      expect(lines).toEqual([]);
      expect(existsSync(markerFilePath)).toBe(false);
    }).pipe(Effect.provide(PlatformLayers))
  );
});

describe('shouldShowUpdateNoticeCore', () => {
  const enabled: AutoUpdateSettings = { enabled: true, channel: 'stable' };
  const disabled: AutoUpdateSettings = { enabled: false, channel: 'stable' };
  let stagingRootDir: string;
  let install: Option.Option<FirstPartyInstall>;

  beforeEach(() => {
    stagingRootDir = join(tempDir, 'staging');
    install = Option.some({
      execPath: join(tempDir, 'install', 'composio'),
      installDir: join(tempDir, 'install'),
      releaseTag: '@composio/cli@0.2.0',
      currentVersion: '0.2.0',
    });
  });

  const evaluate = (settings: AutoUpdateSettings) =>
    shouldShowUpdateNoticeCore({ settings, install, stagingRootDir }).pipe(
      Effect.provide(PlatformLayers)
    );

  it.effect('shows the notice when auto-update is disabled', () =>
    Effect.gen(function* () {
      expect(yield* evaluate(disabled)).toBe(true);
    })
  );

  it.effect('shows the notice when the install is not first-party-resolvable', () =>
    Effect.gen(function* () {
      install = Option.none();
      expect(yield* evaluate(enabled)).toBe(true);
    })
  );

  it.effect('stays silent for a healthy enabled install', () =>
    Effect.gen(function* () {
      expect(yield* evaluate(enabled)).toBe(false);
    })
  );

  it.effect('shows the notice after repeated stage failures for a newer target', () =>
    Effect.gen(function* () {
      writeAttemptFile(stagingRootDir, { version: '0.3.0', failedAttempts: 2 });
      expect(yield* evaluate(enabled)).toBe(true);
    })
  );

  it.effect('stays silent below the failure threshold', () =>
    Effect.gen(function* () {
      writeAttemptFile(stagingRootDir, { version: '0.3.0', failedAttempts: 1 });
      expect(yield* evaluate(enabled)).toBe(false);
    })
  );

  it.effect('stays silent when the failing target is not newer than the install', () =>
    Effect.gen(function* () {
      writeAttemptFile(stagingRootDir, { version: '0.2.0', failedAttempts: 5 });
      expect(yield* evaluate(enabled)).toBe(false);
    })
  );

  it.effect('treats a legacy attempt file without a failure count as healthy', () =>
    Effect.gen(function* () {
      mkdirSync(stagingRootDir, { recursive: true });
      writeFileSync(
        join(stagingRootDir, STAGE_ATTEMPT_FILENAME),
        JSON.stringify({ lastAttempted: new Date().toISOString(), version: '0.3.0' })
      );
      expect(yield* evaluate(enabled)).toBe(false);
    })
  );
});
