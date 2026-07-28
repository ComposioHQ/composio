import { describe, it, expect, beforeEach, afterEach } from '@effect/vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Command, CommandExecutor, Error as PlatformError } from '@effect/platform';
import { BunContext } from '@effect/platform-bun';
import { Effect } from 'effect';
import {
  CLAUDE_PLUGIN_PROBE,
  CODEX_PLUGIN_PROBE,
  cliArtifactStatus,
  createFreshnessReporter,
  deriveArtifactStatus,
  parseManifestVersion,
  parsePluginList,
  parseReleaseTagVersion,
  type FreshnessConfig,
} from 'src/services/artifact-freshness';
import { CommandRunner, type CommandResult } from 'src/services/command-runner';
import type { UpdateStatus } from 'src/services/update-check';

const PlatformLayers = BunContext.layer;

let tempDir: string;
beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'artifact-freshness-test-'));
});
afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const CLAUDE_PLUGIN_LIST = JSON.stringify([
  {
    id: 'composio@composio',
    version: '0.2.2',
    scope: 'user',
    enabled: true,
    installPath: '/home/user/.claude/plugins/cache/composio/composio/0.2.2',
  },
  { id: 'other@marketplace', version: '1.0.0', scope: 'user', enabled: true },
]);

const CODEX_PLUGIN_LIST = JSON.stringify({
  installed: [
    {
      pluginId: 'composio@composio',
      name: 'composio',
      version: '0.2.1',
      installed: true,
      enabled: true,
    },
  ],
});

function manifestResponse(version: string): Response {
  return {
    ok: true,
    text: () => Promise.resolve(JSON.stringify({ name: 'composio', version })),
  } as unknown as Response;
}

function makeRunner(
  respond: (
    executable: string
  ) => Effect.Effect<CommandResult, PlatformError.PlatformError, CommandExecutor.CommandExecutor>
): CommandRunner {
  return new CommandRunner({
    run: () => Effect.succeed(CommandExecutor.ExitCode(0)),
    capture: command => {
      const [first] = Command.flatten(command);
      return respond(first.command);
    },
  });
}

function stdoutRunner(outputs: Record<string, string>): CommandRunner {
  return makeRunner(executable => {
    const stdout = outputs[executable];
    if (stdout === undefined) {
      return Effect.fail(
        new PlatformError.SystemError({ reason: 'NotFound', module: 'Command', method: 'spawn' })
      );
    }
    return Effect.succeed({ exitCode: 0, stdout, stderr: '' });
  });
}

function makeConfig(overrides?: Partial<FreshnessConfig>): FreshnessConfig {
  return {
    skillDir: join(tempDir, '.agents', 'skills', 'composio-cli'),
    fetchFn: () => Promise.reject(new Error('fetch not configured')),
    ...overrides,
  };
}

function writeSkillTag(config: FreshnessConfig, tag: string): void {
  mkdirSync(config.skillDir, { recursive: true });
  writeFileSync(join(config.skillDir, '.composio-release-tag'), `${tag}\n`);
}

// ── Pure helpers ────────────────────────────────────────────────────────

describe('parseReleaseTagVersion', () => {
  it('extracts the semver from a stable release tag', () => {
    expect(parseReleaseTagVersion('@composio/cli@0.2.40')).toBe('0.2.40');
  });

  it('extracts the semver from a beta release tag', () => {
    expect(parseReleaseTagVersion('@composio/cli@0.2.40-beta.5')).toBe('0.2.40-beta.5');
  });

  it('trims surrounding whitespace', () => {
    expect(parseReleaseTagVersion('@composio/cli@0.2.40\n')).toBe('0.2.40');
  });

  it('rejects non-CLI tags and garbage', () => {
    expect(parseReleaseTagVersion('@composio/core@1.0.0')).toBeNull();
    expect(parseReleaseTagVersion('@composio/cli@not-a-version')).toBeNull();
    expect(parseReleaseTagVersion('v0.2.40')).toBeNull();
    expect(parseReleaseTagVersion('')).toBeNull();
  });
});

describe('parsePluginList', () => {
  it('finds the plugin in Claude Code array output', () => {
    expect(parsePluginList(CLAUDE_PLUGIN_LIST, undefined)).toEqual({
      installed: true,
      version: '0.2.2',
    });
  });

  it('finds the plugin under the Codex records key', () => {
    expect(parsePluginList(CODEX_PLUGIN_LIST, 'installed')).toEqual({
      installed: true,
      version: '0.2.1',
    });
  });

  it('reports not installed when the plugin is absent', () => {
    expect(parsePluginList('[]', undefined)).toEqual({ installed: false });
    expect(parsePluginList('{"installed": []}', 'installed')).toEqual({ installed: false });
  });

  it('treats installed: false records as absent', () => {
    const output = JSON.stringify({
      installed: [{ pluginId: 'composio@composio', installed: false }],
    });
    expect(parsePluginList(output, 'installed')).toEqual({ installed: false });
  });

  it('prefers an enabled entry across scopes', () => {
    const output = JSON.stringify([
      { id: 'composio@composio', version: '0.1.0', scope: 'project', enabled: false },
      { id: 'composio@composio', version: '0.2.2', scope: 'user', enabled: true },
    ]);
    expect(parsePluginList(output, undefined)).toEqual({ installed: true, version: '0.2.2' });
  });

  it('reports a null version when the host cannot resolve one', () => {
    const output = JSON.stringify([{ id: 'composio@composio', version: 'unknown' }]);
    expect(parsePluginList(output, undefined)).toEqual({ installed: true, version: null });
  });

  it('returns undefined for uninterpretable output', () => {
    expect(parsePluginList('not-json', undefined)).toBeUndefined();
    expect(parsePluginList('{"other": []}', 'installed')).toBeUndefined();
    expect(parsePluginList('"string"', undefined)).toBeUndefined();
  });
});

describe('parseManifestVersion', () => {
  it('reads the version field', () => {
    expect(parseManifestVersion('{"name": "composio", "version": "0.2.3"}')).toBe('0.2.3');
  });

  it('rejects missing or invalid versions and bodies', () => {
    expect(parseManifestVersion('{"name": "composio"}')).toBeNull();
    expect(parseManifestVersion('{"version": "latest"}')).toBeNull();
    expect(parseManifestVersion('not-json')).toBeNull();
    expect(parseManifestVersion('[]')).toBeNull();
  });
});

describe('deriveArtifactStatus', () => {
  it('maps installed and version pairs to a freshness status', () => {
    expect(deriveArtifactStatus(true, '0.2.2', '0.2.3')).toEqual({
      installed: true,
      current: '0.2.2',
      latest: '0.2.3',
      updateAvailable: true,
      status: 'update-available',
    });
    expect(deriveArtifactStatus(true, '0.2.3', '0.2.3')).toEqual({
      installed: true,
      current: '0.2.3',
      latest: '0.2.3',
      updateAvailable: false,
      status: 'up-to-date',
    });
  });

  it('never reports an update for missing artifacts', () => {
    expect(deriveArtifactStatus(false, null, '0.2.3')).toEqual({
      installed: false,
      current: null,
      latest: '0.2.3',
      updateAvailable: false,
      status: 'not-installed',
    });
  });

  it('reports unknown when either side of the comparison is missing', () => {
    expect(deriveArtifactStatus(true, null, '0.2.3').status).toBe('unknown');
    expect(deriveArtifactStatus(true, '0.2.2', null).status).toBe('unknown');
    expect(deriveArtifactStatus(true, 'garbage', '0.2.3').status).toBe('unknown');
    expect(deriveArtifactStatus(undefined, null, '0.2.3')).toEqual({
      installed: false,
      current: null,
      latest: '0.2.3',
      updateAvailable: false,
      status: 'unknown',
    });
  });

  it('treats a newer installed version as up to date', () => {
    expect(deriveArtifactStatus(true, '0.3.0', '0.2.3').status).toBe('up-to-date');
  });
});

describe('cliArtifactStatus', () => {
  const base: UpdateStatus = {
    current: '0.2.0',
    latestStable: '0.3.0',
    updateAvailable: true,
    checkStatus: 'update-available',
    lastChecked: '2026-07-28T00:00:00.000Z',
  };

  it('mirrors the update-check status', () => {
    expect(cliArtifactStatus(base)).toEqual({
      installed: true,
      current: '0.2.0',
      latest: '0.3.0',
      updateAvailable: true,
      status: 'update-available',
    });
    expect(
      cliArtifactStatus({
        ...base,
        latestStable: '0.2.0',
        updateAvailable: false,
        checkStatus: 'up-to-date',
      }).status
    ).toBe('up-to-date');
    expect(
      cliArtifactStatus({
        ...base,
        latestStable: null,
        updateAvailable: false,
        checkStatus: 'unknown',
      }).status
    ).toBe('unknown');
  });
});

// ── skillStatus ─────────────────────────────────────────────────────────

describe('skillStatus', () => {
  it.effect('reports not installed when the skill directory is missing', () =>
    Effect.gen(function* () {
      const { skillStatus } = createFreshnessReporter(makeConfig());

      const status = yield* skillStatus('0.2.41');

      expect(status).toEqual({
        installed: false,
        current: null,
        latest: '0.2.41',
        updateAvailable: false,
        status: 'not-installed',
      });
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('compares the stamped release tag against the latest CLI release', () =>
    Effect.gen(function* () {
      const config = makeConfig();
      writeSkillTag(config, '@composio/cli@0.2.40');
      const { skillStatus } = createFreshnessReporter(config);

      const status = yield* skillStatus('0.2.41');

      expect(status).toEqual({
        installed: true,
        current: '0.2.40',
        latest: '0.2.41',
        updateAvailable: true,
        status: 'update-available',
      });
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('reports up to date when the stamp matches the latest release', () =>
    Effect.gen(function* () {
      const config = makeConfig();
      writeSkillTag(config, '@composio/cli@0.2.41');
      const { skillStatus } = createFreshnessReporter(config);

      const status = yield* skillStatus('0.2.41');

      expect(status.status).toBe('up-to-date');
      expect(status.updateAvailable).toBe(false);
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('reports unknown for an unstamped skill directory', () =>
    Effect.gen(function* () {
      const config = makeConfig();
      mkdirSync(config.skillDir, { recursive: true });
      const { skillStatus } = createFreshnessReporter(config);

      const status = yield* skillStatus('0.2.41');

      expect(status).toEqual({
        installed: true,
        current: null,
        latest: '0.2.41',
        updateAvailable: false,
        status: 'unknown',
      });
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('reports unknown when the latest CLI release is unknown', () =>
    Effect.gen(function* () {
      const config = makeConfig();
      writeSkillTag(config, '@composio/cli@0.2.40');
      const { skillStatus } = createFreshnessReporter(config);

      const status = yield* skillStatus(null);

      expect(status.status).toBe('unknown');
      expect(status.current).toBe('0.2.40');
    }).pipe(Effect.provide(PlatformLayers))
  );
});

// ── pluginStatus ────────────────────────────────────────────────────────

describe('pluginStatus', () => {
  it.effect('reports an available update from plugin list and HEAD manifest', () =>
    Effect.gen(function* () {
      const config = makeConfig({
        fetchFn: () => Promise.resolve(manifestResponse('0.2.3')),
      });
      const { pluginStatus } = createFreshnessReporter(config);

      const status = yield* pluginStatus(CLAUDE_PLUGIN_PROBE).pipe(
        Effect.provideService(CommandRunner, stdoutRunner({ claude: CLAUDE_PLUGIN_LIST }))
      );

      expect(status).toEqual({
        installed: true,
        current: '0.2.2',
        latest: '0.2.3',
        updateAvailable: true,
        status: 'update-available',
      });
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('reports up to date for the Codex plugin at the latest version', () =>
    Effect.gen(function* () {
      const config = makeConfig({
        fetchFn: () => Promise.resolve(manifestResponse('0.2.1')),
      });
      const { pluginStatus } = createFreshnessReporter(config);

      const status = yield* pluginStatus(CODEX_PLUGIN_PROBE).pipe(
        Effect.provideService(CommandRunner, stdoutRunner({ codex: CODEX_PLUGIN_LIST }))
      );

      expect(status.status).toBe('up-to-date');
      expect(status.current).toBe('0.2.1');
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('reports not installed when the host binary is missing', () =>
    Effect.gen(function* () {
      const config = makeConfig({
        fetchFn: () => Promise.resolve(manifestResponse('0.2.3')),
      });
      const { pluginStatus } = createFreshnessReporter(config);

      const status = yield* pluginStatus(CLAUDE_PLUGIN_PROBE).pipe(
        Effect.provideService(CommandRunner, stdoutRunner({}))
      );

      expect(status).toEqual({
        installed: false,
        current: null,
        latest: '0.2.3',
        updateAvailable: false,
        status: 'not-installed',
      });
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('reports not installed when the plugin is absent from the host', () =>
    Effect.gen(function* () {
      const config = makeConfig({
        fetchFn: () => Promise.resolve(manifestResponse('0.2.3')),
      });
      const { pluginStatus } = createFreshnessReporter(config);

      const status = yield* pluginStatus(CLAUDE_PLUGIN_PROBE).pipe(
        Effect.provideService(CommandRunner, stdoutRunner({ claude: '[]' }))
      );

      expect(status.status).toBe('not-installed');
      expect(status.latest).toBe('0.2.3');
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('reports unknown when the host command fails', () =>
    Effect.gen(function* () {
      const config = makeConfig({
        fetchFn: () => Promise.resolve(manifestResponse('0.2.3')),
      });
      const { pluginStatus } = createFreshnessReporter(config);
      const failingRunner = makeRunner(() =>
        Effect.succeed({ exitCode: 1, stdout: '', stderr: 'boom' })
      );

      const status = yield* pluginStatus(CLAUDE_PLUGIN_PROBE).pipe(
        Effect.provideService(CommandRunner, failingRunner)
      );

      expect(status.status).toBe('unknown');
      expect(status.latest).toBe('0.2.3');
    }).pipe(Effect.provide(PlatformLayers))
  );

  it.effect('reports unknown latest when the manifest fetch fails', () =>
    Effect.gen(function* () {
      const config = makeConfig({
        fetchFn: () => Promise.reject(new Error('offline')),
      });
      const { pluginStatus } = createFreshnessReporter(config);

      const status = yield* pluginStatus(CLAUDE_PLUGIN_PROBE).pipe(
        Effect.provideService(CommandRunner, stdoutRunner({ claude: CLAUDE_PLUGIN_LIST }))
      );

      expect(status).toEqual({
        installed: true,
        current: '0.2.2',
        latest: null,
        updateAvailable: false,
        status: 'unknown',
      });
    }).pipe(Effect.provide(PlatformLayers))
  );
});

// ── collectArtifacts ────────────────────────────────────────────────────

describe('collectArtifacts', () => {
  it.effect('assembles the full artifact report', () =>
    Effect.gen(function* () {
      const cli: UpdateStatus = {
        current: '0.2.40',
        latestStable: '0.2.41',
        updateAvailable: true,
        checkStatus: 'update-available',
        lastChecked: '2026-07-28T00:00:00.000Z',
      };
      const config = makeConfig({
        fetchFn: url => {
          if (url.includes('composio-plugin-cc')) {
            return Promise.resolve(manifestResponse('0.2.3'));
          }
          return Promise.resolve(manifestResponse('0.2.2'));
        },
      });
      writeSkillTag(config, '@composio/cli@0.2.41');
      const { collectArtifacts } = createFreshnessReporter(config);

      const artifacts = yield* collectArtifacts(cli).pipe(
        Effect.provideService(
          CommandRunner,
          stdoutRunner({ claude: CLAUDE_PLUGIN_LIST, codex: CODEX_PLUGIN_LIST })
        )
      );

      expect(artifacts).toEqual({
        cli: {
          installed: true,
          current: '0.2.40',
          latest: '0.2.41',
          updateAvailable: true,
          status: 'update-available',
        },
        skill: {
          installed: true,
          current: '0.2.41',
          latest: '0.2.41',
          updateAvailable: false,
          status: 'up-to-date',
        },
        claudePlugin: {
          installed: true,
          current: '0.2.2',
          latest: '0.2.3',
          updateAvailable: true,
          status: 'update-available',
        },
        codexPlugin: {
          installed: true,
          current: '0.2.1',
          latest: '0.2.2',
          updateAvailable: true,
          status: 'update-available',
        },
      });
    }).pipe(Effect.provide(PlatformLayers))
  );
});
