import { describe, expect, it } from '@effect/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { FetchHttpClient, FileSystem, Path } from '@effect/platform';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as tempy from 'tempy';
import {
  clearApolloIdentityForAnalytics,
  emitPostHogAlias,
  getCurrentCwdSessionId,
  linkApolloIdentityForAnalytics,
  readApiBaseUrl,
  runBackgroundWorkerFromArgv,
  trackCliCodactFailureEffect,
  trackCliEventEffect,
} from 'src/analytics/dispatch';
import { CLI_ANALYTICS_EVENTS } from 'src/analytics/events';
import { cliRunIdLayer } from 'src/services/runtime-cli-context';
import { APP_VERSION, USER_CONFIG_FILE_NAME } from 'src/constants';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { TerminalUITest } from 'test/__utils__/services/terminal-ui-test';

const childProcessMocks = vi.hoisted(() => ({
  once: vi.fn(),
  removeListener: vi.fn(),
  spawn: vi.fn(),
  unref: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: childProcessMocks.spawn,
}));

const originalArgv = [...process.argv];

const cwdHash = (cwd: string): string => {
  let hash = 5381;
  for (let index = 0; index < cwd.length; index += 1) {
    hash = (hash * 33) ^ cwd.charCodeAt(index);
  }
  return Math.abs(hash >>> 0).toString(36);
};

const makePlatformLayer = (home: string) =>
  Layer.mergeAll(
    BunFileSystem.layer,
    BunPath.layer,
    FetchHttpClient.layer,
    TerminalUITest,
    Layer.succeed(NodeOs, defaultNodeOs({ homedir: home }))
  );

const enableTelemetry = (apiKey = 'uak_test') => {
  vi.stubEnv('COMPOSIO_BASE_URL', 'https://backend.example.test');
  vi.stubEnv('COMPOSIO_USER_API_KEY', apiKey);
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('CI', 'false');
  vi.stubEnv('COMPOSIO_CLI_TELEMETRY_DISABLED', 'false');
  vi.stubEnv('TELEMETRY_DISABLED', 'false');
  vi.stubEnv('COMPOSIO_DISABLE_TELEMETRY', 'false');
  // A configured project key is what gates delivery/worker spawning; enabled
  // telemetry implies a target. The no-key path is covered explicitly below.
  vi.stubEnv('COMPOSIO_POSTHOG_PROJECT_API_KEY', 'phc_test_key');
};

const decodeWorkerPayload = <A>(encodedPayload: string): A => {
  const normalized = encodedPayload.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(atob(padded)) as A;
};

const encodeWorkerPayload = (payload: unknown): string =>
  btoa(JSON.stringify(payload)).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');

describe('CLI analytics dispatch', () => {
  beforeEach(() => {
    const child = {
      once: childProcessMocks.once,
      removeListener: childProcessMocks.removeListener,
      unref: childProcessMocks.unref,
    };
    // spawnDetached resolves only after Node's 'spawn' confirmation event, so
    // the mock child fires it synchronously on registration.
    childProcessMocks.once.mockReset().mockImplementation((event: string, listener: () => void) => {
      if (event === 'spawn') {
        listener();
      }
      return child;
    });
    childProcessMocks.removeListener.mockReset().mockReturnValue(child);
    childProcessMocks.spawn.mockReset().mockReturnValue(child);
    childProcessMocks.unref.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.argv = [...originalArgv];
  });

  it.effect(
    'reads configuration and the freshest current-directory session via platform services',
    () => {
      const home = tempy.temporaryDirectory();
      const cacheDir = tempy.temporaryDirectory();
      const cwd = '/workspace/project';
      vi.stubEnv('COMPOSIO_CACHE_DIR', cacheDir);
      vi.stubEnv('COMPOSIO_BASE_URL', '');

      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.writeFileString(
          path.join(cacheDir, USER_CONFIG_FILE_NAME),
          JSON.stringify({ base_url: 'https://backend.example.test///' })
        );
        yield* fs.writeFileString(
          path.join(cacheDir, 'consumer-short-term-cache.json'),
          JSON.stringify({
            older: {
              probablyMyCliSessionsByCwdHash: {
                [cwdHash(cwd)]: {
                  id: 'cli_s_older',
                  // The TestClock sits at epoch 0, so these fixed instants are
                  // deterministically 30s and 60s in the future.
                  expiresAt: '1970-01-01T00:00:30.000Z',
                },
              },
            },
            newer: {
              probablyMyCliSessionsByCwdHash: {
                [cwdHash(cwd)]: {
                  id: 'cli_s_newer',
                  expiresAt: '1970-01-01T00:01:00.000Z',
                },
              },
            },
          })
        );

        expect(yield* readApiBaseUrl).toBe('https://backend.example.test');
        expect(yield* getCurrentCwdSessionId(cwd)).toBe('cli_s_newer');
      }).pipe(Effect.provide(makePlatformLayer(home)));
    }
  );

  it.effect('ignores malformed worker payloads', () => {
    const home = tempy.temporaryDirectory();

    return runBackgroundWorkerFromArgv([
      process.execPath,
      'composio',
      '__analytics-worker',
      'not-base64',
    ]).pipe(Effect.provide(makePlatformLayer(home)));
  });

  it.effect('delivers analytics worker payloads directly to PostHog', () => {
    const home = tempy.temporaryDirectory();
    const envelope = {
      event: 'cli_command_invoked',
      properties: { cli_version: '9.9.9' },
      sentAt: '2026-07-16T00:00:00.000Z',
      source: 'cli' as const,
      distinctId: 'install_test',
      installId: 'install_test',
    };
    const encodedPayload = btoa(JSON.stringify(envelope))
      .replace(/\+/gu, '-')
      .replace(/\//gu, '_')
      .replace(/=+$/u, '');
    enableTelemetry();
    // Direct-to-PostHog transport does NOT read the Composio base URL. Overriding
    // the ingest URL + a fake public key keeps the test off the real project.
    vi.stubEnv('COMPOSIO_BASE_URL', '');
    vi.stubEnv('COMPOSIO_POSTHOG_INGEST_URL', 'https://posthog.example.test/i/v0/e/');
    vi.stubEnv('COMPOSIO_POSTHOG_PROJECT_API_KEY', 'phc_test_key');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    return Effect.gen(function* () {
      yield* runBackgroundWorkerFromArgv([
        process.execPath,
        'composio',
        '__analytics-worker',
        encodedPayload,
      ]).pipe(Effect.provide(makePlatformLayer(home)));

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [endpoint, request] = fetchSpy.mock.calls[0]!;
      expect(String(endpoint)).toBe('https://posthog.example.test/i/v0/e/');
      expect(request).toMatchObject({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-composio-analytics-source': 'cli',
        }),
      });
      // The public write key authenticates in-band; no user API key is attached.
      expect((request?.headers as Record<string, string>)['x-user-api-key']).toBeUndefined();
      const body = JSON.parse(new TextDecoder().decode(request?.body as Uint8Array));
      expect(body).toMatchObject({
        api_key: 'phc_test_key',
        event: 'cli_command_invoked',
        distinct_id: 'install_test',
        timestamp: '2026-07-16T00:00:00.000Z',
        properties: expect.objectContaining({
          cli_version: '9.9.9',
          install_id: 'install_test',
          $lib: 'composio-cli',
        }),
      });
    });
  });

  it.effect('skips PostHog delivery when no project key is configured', () => {
    const home = tempy.temporaryDirectory();
    const envelope = {
      event: 'cli_command_invoked',
      sentAt: '2026-07-16T00:00:00.000Z',
      source: 'cli' as const,
      distinctId: 'install_test',
      installId: 'install_test',
    };
    const encodedPayload = btoa(JSON.stringify(envelope))
      .replace(/\+/gu, '-')
      .replace(/\//gu, '_')
      .replace(/=+$/u, '');
    enableTelemetry();
    // No project key -> the empty embedded placeholder, so the worker's delivery
    // is a safe no-op until the real key is baked in.
    vi.stubEnv('COMPOSIO_POSTHOG_PROJECT_API_KEY', '');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    return Effect.gen(function* () {
      yield* runBackgroundWorkerFromArgv([
        process.execPath,
        'composio',
        '__analytics-worker',
        encodedPayload,
      ]).pipe(Effect.provide(makePlatformLayer(home)));

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  it.effect('does not spawn a worker when no project key is configured', () => {
    const home = tempy.temporaryDirectory();
    const scriptPath = `${home}/composio.ts`;
    enableTelemetry();
    // Empty key: forks / local builds without a baked key must not spawn a
    // detached worker on every command just to have it no-op.
    vi.stubEnv('COMPOSIO_POSTHOG_PROJECT_API_KEY', '');
    process.argv[1] = scriptPath;

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(scriptPath, '');
      yield* trackCliEventEffect({ name: 'producer_event', properties: { sample: 'value' } });

      expect(childProcessMocks.spawn).not.toHaveBeenCalled();
      expect(yield* fs.exists(path.join(home, '.composio', 'analytics.json'))).toBe(false);
    }).pipe(Effect.provide(makePlatformLayer(home)));
  });

  it.effect('spawns a detached analytics worker with a decodable envelope', () => {
    const home = tempy.temporaryDirectory();
    const scriptPath = `${home}/composio.ts`;
    enableTelemetry();
    process.argv[1] = scriptPath;

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(scriptPath, '');
      yield* trackCliEventEffect({
        name: 'producer_event',
        properties: { sample: 'value' },
      });

      expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
      const [command, args, options] = childProcessMocks.spawn.mock.calls[0] as unknown as [
        string,
        string[],
        { detached: boolean; stdio: unknown },
      ];
      expect(command).toBe(process.execPath);
      expect(args.slice(0, 2)).toEqual([scriptPath, '__analytics-worker']);
      expect(args).toHaveLength(3);
      expect(decodeWorkerPayload(args[2]!)).toMatchObject({
        event: 'producer_event',
        properties: { cli_version: APP_VERSION, sample: 'value' },
        source: 'cli',
      });
      expect(options).toMatchObject({
        detached: true,
        stdio: 'ignore',
      });
      expect(options).not.toHaveProperty('env');
      expect(childProcessMocks.once).toHaveBeenCalledWith('error', expect.any(Function));
      expect(childProcessMocks.unref).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(makePlatformLayer(home)));
  });

  it.effect('propagates telemetry debug to the detached worker without an env write', () => {
    const home = tempy.temporaryDirectory();
    const scriptPath = `${home}/composio.ts`;
    enableTelemetry();
    vi.stubEnv('COMPOSIO_CLI_TELEMETRY_DEBUG', 'true');
    process.argv[1] = scriptPath;

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(scriptPath, '');
      yield* trackCliEventEffect({ name: 'producer_event' });

      const [, args, options] = childProcessMocks.spawn.mock.calls[0] as unknown as [
        string,
        string[],
        { detached: boolean; stdio: unknown },
      ];
      expect(args).toHaveLength(4);
      expect(args.at(-1)).toBe('--telemetry-debug');
      expect(options.stdio).toEqual(['ignore', 'ignore', 'inherit']);
      expect(options).not.toHaveProperty('env');
    }).pipe(Effect.provide(makePlatformLayer(home)));
  });

  it.effect('spawns a detached codact worker with a decodable failure body', () => {
    const home = tempy.temporaryDirectory();
    const scriptPath = `${home}/composio.ts`;
    enableTelemetry();
    vi.stubEnv('COMPOSIO_CLI_INVOCATION_ORIGIN', 'agent');
    vi.stubEnv('COMPOSIO_CLI_PARENT_RUN_ID', 'run_parent');
    process.argv[1] = scriptPath;

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(scriptPath, '');
      yield* trackCliCodactFailureEffect({
        failureType: 'wrong_tool_input_param',
        toolInfo: {
          toolkit: 'github',
          tool: { slug: 'GITHUB_CREATE_ISSUE', version: 'latest' },
        },
        ctx: { invalidKey: 'repo' },
        requestId: 'req_producer',
      });

      expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
      const [command, args, options] = childProcessMocks.spawn.mock.calls[0] as unknown as [
        string,
        string[],
        { detached: boolean; stdio: unknown },
      ];
      expect(command).toBe(process.execPath);
      expect(args.slice(0, 2)).toEqual([scriptPath, '__codact-failure-worker']);
      expect(args).toHaveLength(3);
      expect(decodeWorkerPayload(args[2]!)).toMatchObject({
        failure_type: 'wrong_tool_input_param',
        tool_info: {
          toolkit: 'github',
          tool: { slug: 'GITHUB_CREATE_ISSUE', version: 'latest' },
        },
        ctx: { invalidKey: 'repo' },
        request_id: 'req_producer',
        session: {
          cli_version: APP_VERSION,
          invocation_origin: 'agent',
          parent_run_id: 'run_parent',
          source: 'cli',
        },
      });
      expect(options).toMatchObject({
        detached: true,
        stdio: 'ignore',
      });
      expect(options).not.toHaveProperty('env');
      expect(childProcessMocks.once).toHaveBeenCalledWith('error', expect.any(Function));
      expect(childProcessMocks.unref).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(makePlatformLayer(home)));
  });

  it.effect(
    'stamps codact failures with the minted CliRunId when no parent run id is inherited',
    () => {
      const home = tempy.temporaryDirectory();
      const scriptPath = `${home}/composio.ts`;
      enableTelemetry();
      process.argv[1] = scriptPath;

      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(scriptPath, '');
        yield* trackCliCodactFailureEffect({
          failureType: 'wrong_tool_slug',
          ctx: { slug: 'MISSING_TOOL' },
        });

        expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
        const args = childProcessMocks.spawn.mock.calls[0]![1] as string[];
        expect(decodeWorkerPayload(args[2]!)).toMatchObject({
          failure_type: 'wrong_tool_slug',
          session: {
            parent_run_id: 'run_minted',
          },
        });
      }).pipe(Effect.provide(cliRunIdLayer('run_minted')), Effect.provide(makePlatformLayer(home)));
    }
  );

  it.effect('keeps both producer effects non-fatal when spawn throws', () => {
    const home = tempy.temporaryDirectory();
    enableTelemetry();
    childProcessMocks.spawn.mockImplementation(() => {
      throw new Error('spawn failed');
    });

    return Effect.gen(function* () {
      yield* trackCliEventEffect({ name: 'producer_event' });
      yield* trackCliCodactFailureEffect({
        failureType: 'wrong_tool_slug',
        ctx: { slug: 'MISSING_TOOL' },
      });

      expect(childProcessMocks.spawn).toHaveBeenCalledTimes(2);
      expect(childProcessMocks.unref).not.toHaveBeenCalled();
    }).pipe(Effect.provide(makePlatformLayer(home)));
  });

  it.effect('honors Effect boolean config when telemetry is disabled', () => {
    const home = tempy.temporaryDirectory();
    enableTelemetry();
    vi.stubEnv('COMPOSIO_CLI_TELEMETRY_DISABLED', 'yes');

    return Effect.gen(function* () {
      yield* trackCliEventEffect({ name: 'producer_event' });
      yield* trackCliCodactFailureEffect({
        failureType: 'wrong_tool_slug',
        ctx: { slug: 'MISSING_TOOL' },
      });
      yield* emitPostHogAlias('install_disabled', 'apollo_user_disabled');
      yield* linkApolloIdentityForAnalytics('apollo_user_disabled');

      expect(childProcessMocks.spawn).not.toHaveBeenCalled();

      // Disabled telemetry must not even create the local identity file.
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const exists = yield* fs.exists(path.join(home, '.composio', 'analytics.json'));
      expect(exists).toBe(false);
    }).pipe(Effect.provide(makePlatformLayer(home)));
  });

  it.effect('keys pre-login events on the bare install_id', () => {
    const home = tempy.temporaryDirectory();
    const scriptPath = `${home}/composio.ts`;
    // No persisted apollo_user_id and no user API key -> anonymous device identity.
    enableTelemetry('');
    process.argv[1] = scriptPath;

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(scriptPath, '');
      yield* trackCliEventEffect({ name: CLI_ANALYTICS_EVENTS.CLI_SETUP_SUCCEEDED });

      expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
      const args = childProcessMocks.spawn.mock.calls[0]![1] as string[];
      const payload = decodeWorkerPayload<{ distinctId: string; installId: string }>(args[2]!);
      // Pre-login, distinct_id is the raw install_id (not `anon_<id>`), so the
      // login-time alias can merge this exact person into the Apollo user.
      expect(payload.installId.length).toBeGreaterThan(0);
      expect(payload.distinctId).toBe(payload.installId);
    }).pipe(Effect.provide(makePlatformLayer(home)));
  });

  it.effect('uses one install_id across concurrent first-run events', () => {
    const home = tempy.temporaryDirectory();
    const scriptPath = `${home}/composio.ts`;
    enableTelemetry('');
    process.argv[1] = scriptPath;

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.writeFileString(scriptPath, '');

      yield* Effect.all(
        Array.from({ length: 16 }, (_, index) =>
          trackCliEventEffect({
            name: 'producer_event',
            properties: { index },
          })
        ),
        { concurrency: 'unbounded' }
      );

      expect(childProcessMocks.spawn).toHaveBeenCalledTimes(16);
      const installIds = childProcessMocks.spawn.mock.calls.map(call => {
        const args = call[1] as string[];
        return decodeWorkerPayload<{ installId: string }>(args[2]!).installId;
      });
      expect(new Set(installIds).size).toBe(1);

      const persisted = JSON.parse(
        yield* fs.readFileString(path.join(home, '.composio', 'analytics.json'), 'utf8')
      ) as { install_id: string };
      expect(persisted.install_id).toBe(installIds[0]);
    }).pipe(Effect.provide(makePlatformLayer(home)));
  });

  it.effect('waits for a live analytics-state lock instead of exhausting retries', () => {
    const home = tempy.temporaryDirectory();
    const scriptPath = path.join(home, 'composio.ts');
    const composioDir = path.join(home, '.composio');
    const lockPath = path.join(composioDir, 'analytics.json.lock');
    enableTelemetry('');
    process.argv[1] = scriptPath;
    mkdirSync(composioDir, { recursive: true });
    writeFileSync(scriptPath, '');
    writeFileSync(lockPath, 'other-process');
    const releaseTimer = setTimeout(() => rmSync(lockPath, { force: true }), 25);

    return Effect.gen(function* () {
      yield* trackCliEventEffect({ name: CLI_ANALYTICS_EVENTS.CLI_SETUP_SUCCEEDED });

      const fs = yield* FileSystem.FileSystem;
      expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
      expect(yield* fs.exists(lockPath)).toBe(false);
    }).pipe(
      Effect.ensuring(Effect.sync(() => clearTimeout(releaseTimer))),
      Effect.provide(makePlatformLayer(home))
    );
  });

  it.effect('bounds the delay when another process leaves a live state lock behind', () => {
    const home = tempy.temporaryDirectory();
    const scriptPath = path.join(home, 'composio.ts');
    const composioDir = path.join(home, '.composio');
    const lockPath = path.join(composioDir, 'analytics.json.lock');
    enableTelemetry('');
    process.argv[1] = scriptPath;
    mkdirSync(composioDir, { recursive: true });
    writeFileSync(scriptPath, '');
    writeFileSync(lockPath, 'other-process');

    return Effect.gen(function* () {
      const completedBeforeDeadline = yield* Effect.race(
        trackCliEventEffect({ name: CLI_ANALYTICS_EVENTS.CLI_SETUP_SUCCEEDED }).pipe(
          Effect.as(true)
        ),
        Effect.promise(
          () =>
            new Promise<boolean>(resolve => {
              setTimeout(() => resolve(false), 1_500);
            })
        )
      );

      expect(completedBeforeDeadline).toBe(true);
      expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(makePlatformLayer(home)));
  });

  it.effect('keys post-login events on the persisted apollo_user_id', () => {
    const home = tempy.temporaryDirectory();
    const scriptPath = `${home}/composio.ts`;
    enableTelemetry('uak_persisted');
    process.argv[1] = scriptPath;

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(scriptPath, '');

      // Establish the identity under this credential; the id is only trusted
      // while that same credential is active.
      yield* linkApolloIdentityForAnalytics('om_apollo_123');
      childProcessMocks.spawn.mockClear();

      yield* trackCliEventEffect({ name: CLI_ANALYTICS_EVENTS.CLI_EXECUTE_SUCCEEDED });

      expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
      const args = childProcessMocks.spawn.mock.calls[0]![1] as string[];
      const payload = decodeWorkerPayload<{ distinctId: string }>(args[2]!);
      expect(payload.distinctId).toBe('om_apollo_123');
    }).pipe(Effect.provide(makePlatformLayer(home)));
  });

  it.effect('persists apollo_user_id and emits exactly one $create_alias at login', () => {
    const home = tempy.temporaryDirectory();
    const scriptPath = `${home}/composio.ts`;
    enableTelemetry('');
    process.argv[1] = scriptPath;

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.writeFileString(scriptPath, '');
      const composioDir = path.join(home, '.composio');
      yield* fs.makeDirectory(composioDir, { recursive: true });
      yield* fs.writeFileString(
        path.join(composioDir, 'analytics.json'),
        JSON.stringify({ install_id: 'install_login', created_at: '2026-01-01T00:00:00.000Z' })
      );

      yield* linkApolloIdentityForAnalytics('om_apollo_login');

      // Exactly one alias event is spawned.
      expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
      const args = childProcessMocks.spawn.mock.calls[0]![1] as string[];
      const payload = decodeWorkerPayload<{
        event: string;
        distinctId: string;
        installId: string;
        properties: { distinct_id: string; alias: string };
      }>(args[2]!);
      expect(payload.event).toBe('$create_alias');
      expect(payload.distinctId).toBe('om_apollo_login');
      expect(payload.installId).toBe('install_login');
      expect(payload.properties).toMatchObject({
        distinct_id: 'om_apollo_login',
        alias: 'install_login',
      });

      // The Apollo id and pending alias are persisted while keeping the
      // original install_id/created_at.
      const persisted = JSON.parse(
        yield* fs.readFileString(path.join(composioDir, 'analytics.json'), 'utf8')
      ) as {
        install_id: string;
        apollo_user_id: string;
        pending_alias_apollo_user_id: string;
        created_at: string;
      };
      expect(persisted).toMatchObject({
        install_id: 'install_login',
        apollo_user_id: 'om_apollo_login',
        pending_alias_apollo_user_id: 'om_apollo_login',
        created_at: '2026-01-01T00:00:00.000Z',
      });

      // A repeat login while delivery is pending does not re-emit the alias.
      yield* linkApolloIdentityForAnalytics('om_apollo_login');
      expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);

      vi.stubEnv('COMPOSIO_POSTHOG_INGEST_URL', 'https://posthog.example.test/i/v0/e/');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
      yield* runBackgroundWorkerFromArgv([
        process.execPath,
        'composio',
        '__analytics-worker',
        args[2]!,
      ]).pipe(Effect.provide(makePlatformLayer(home)));

      const acknowledged = JSON.parse(
        yield* fs.readFileString(path.join(composioDir, 'analytics.json'), 'utf8')
      ) as {
        aliased_apollo_user_id?: string;
        pending_alias_apollo_user_id?: string;
      };
      expect(acknowledged.aliased_apollo_user_id).toBe('om_apollo_login');
      expect(acknowledged.pending_alias_apollo_user_id).toBeUndefined();
    }).pipe(Effect.provide(makePlatformLayer(home)));
  });

  it.effect('retries an alias after the worker reports a failed delivery', () => {
    const home = tempy.temporaryDirectory();
    const scriptPath = `${home}/composio.ts`;
    enableTelemetry('');
    process.argv[1] = scriptPath;

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(scriptPath, '');

      yield* linkApolloIdentityForAnalytics('om_alias_retry');
      expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
      const args = childProcessMocks.spawn.mock.calls[0]![1] as string[];

      vi.stubEnv('COMPOSIO_POSTHOG_INGEST_URL', 'https://posthog.example.test/i/v0/e/');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));
      yield* runBackgroundWorkerFromArgv([
        process.execPath,
        'composio',
        '__analytics-worker',
        args[2]!,
      ]).pipe(Effect.provide(makePlatformLayer(home)));

      const afterFailure = JSON.parse(
        yield* fs.readFileString(path.join(home, '.composio', 'analytics.json'), 'utf8')
      ) as {
        aliased_apollo_user_id?: string;
        pending_alias_apollo_user_id?: string;
      };
      expect(afterFailure.aliased_apollo_user_id).toBeUndefined();
      expect(afterFailure.pending_alias_apollo_user_id).toBeUndefined();

      yield* linkApolloIdentityForAnalytics('om_alias_retry');
      expect(childProcessMocks.spawn).toHaveBeenCalledTimes(2);
    }).pipe(Effect.provide(makePlatformLayer(home)));
  });

  it.effect('emits one alias across concurrent identity links', () => {
    const home = tempy.temporaryDirectory();
    const scriptPath = `${home}/composio.ts`;
    enableTelemetry('uak_concurrent');
    process.argv[1] = scriptPath;

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.writeFileString(scriptPath, '');

      yield* Effect.all(
        Array.from({ length: 8 }, () =>
          linkApolloIdentityForAnalytics('om_concurrent', 'uak_concurrent')
        ),
        { concurrency: 'unbounded' }
      );

      expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
      const persisted = JSON.parse(
        yield* fs.readFileString(path.join(home, '.composio', 'analytics.json'), 'utf8')
      ) as {
        apollo_user_id: string;
        pending_alias_apollo_user_id: string;
        api_key_fingerprint: string;
      };
      expect(persisted.apollo_user_id).toBe('om_concurrent');
      expect(persisted.pending_alias_apollo_user_id).toBe('om_concurrent');
      expect(persisted.api_key_fingerprint.length).toBeGreaterThan(0);
    }).pipe(Effect.provide(makePlatformLayer(home)));
  });

  it.effect('retries the alias when the first attempt could not be enqueued', () => {
    const home = tempy.temporaryDirectory();
    const scriptPath = `${home}/composio.ts`;
    enableTelemetry();
    vi.stubEnv('COMPOSIO_POSTHOG_PROJECT_API_KEY', '');
    process.argv[1] = scriptPath;

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.writeFileString(scriptPath, '');

      // No key -> no analytics state or worker is created.
      yield* linkApolloIdentityForAnalytics('om_apollo_retry');
      expect(childProcessMocks.spawn).not.toHaveBeenCalled();
      expect(yield* fs.exists(path.join(home, '.composio', 'analytics.json'))).toBe(false);

      // Once a key is configured the alias is attempted again.
      vi.stubEnv('COMPOSIO_POSTHOG_PROJECT_API_KEY', 'phc_test_key');
      yield* linkApolloIdentityForAnalytics('om_apollo_retry');
      expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
      const afterRetry = JSON.parse(
        yield* fs.readFileString(path.join(home, '.composio', 'analytics.json'), 'utf8')
      ) as { pending_alias_apollo_user_id?: string };
      expect(afterRetry.pending_alias_apollo_user_id).toBe('om_apollo_retry');
    }).pipe(Effect.provide(makePlatformLayer(home)));
  });

  it.effect('clears the Apollo identity on logout so events revert to install_id', () => {
    const home = tempy.temporaryDirectory();
    const scriptPath = `${home}/composio.ts`;
    enableTelemetry('');
    process.argv[1] = scriptPath;

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.writeFileString(scriptPath, '');
      const composioDir = path.join(home, '.composio');
      yield* fs.makeDirectory(composioDir, { recursive: true });
      yield* fs.writeFileString(
        path.join(composioDir, 'analytics.json'),
        JSON.stringify({ install_id: 'install_logout', apollo_user_id: 'om_apollo_gone' })
      );

      yield* clearApolloIdentityForAnalytics;

      const persisted = JSON.parse(
        yield* fs.readFileString(path.join(composioDir, 'analytics.json'), 'utf8')
      ) as { install_id: string; apollo_user_id?: string };
      expect(persisted.install_id).toBe('install_logout');
      expect(persisted.apollo_user_id).toBeUndefined();

      // Later events fall back to the anonymous install identity.
      yield* trackCliEventEffect({ name: 'producer_event' });
      const args = childProcessMocks.spawn.mock.calls[0]![1] as string[];
      const payload = decodeWorkerPayload<{ distinctId: string }>(args[2]!);
      expect(payload.distinctId).toBe('install_logout');
    }).pipe(Effect.provide(makePlatformLayer(home)));
  });

  it.effect('delivers codact worker failures with the user key and session body', () => {
    const home = tempy.temporaryDirectory();
    const failureBody = {
      failure_type: 'wrong_tool_input_param',
      tool_info: {
        toolkit: 'github',
        tool: { slug: 'GITHUB_CREATE_ISSUE', version: 'latest' },
      },
      ctx: { invalidKey: 'repository' },
      session: {
        source: 'cli',
        id: 'cli_s_worker',
        cli_version: '0.3.0-test',
        invocation_origin: 'agent',
        parent_run_id: 'run_parent',
      },
      request_id: 'req_worker',
    };
    enableTelemetry('uak_worker');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    return Effect.gen(function* () {
      yield* runBackgroundWorkerFromArgv([
        process.execPath,
        'composio',
        '__codact-failure-worker',
        encodeWorkerPayload(failureBody),
      ]).pipe(Effect.provide(makePlatformLayer(home)));

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [endpoint, request] = fetchSpy.mock.calls[0]!;
      expect(String(endpoint)).toBe('https://backend.example.test/api/v3/cli/codact_failures');
      expect(request).toMatchObject({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-user-api-key': 'uak_worker',
        }),
      });
      expect(JSON.parse(new TextDecoder().decode(request?.body as Uint8Array))).toEqual(
        failureBody
      );
    });
  });

  it.effect('ignores malformed codact worker payloads', () => {
    const home = tempy.temporaryDirectory();
    enableTelemetry();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    return Effect.gen(function* () {
      yield* runBackgroundWorkerFromArgv([
        process.execPath,
        'composio',
        '__codact-failure-worker',
        'not-base64',
      ]).pipe(Effect.provide(makePlatformLayer(home)));

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  it.effect('skips codact worker delivery without a user key', () => {
    const home = tempy.temporaryDirectory();
    enableTelemetry('');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const failureBody = {
      failure_type: 'wrong_tool_slug',
      ctx: { slug: 'MISSING_TOOL' },
      session: { source: 'cli' },
    };

    return Effect.gen(function* () {
      yield* runBackgroundWorkerFromArgv([
        process.execPath,
        'composio',
        '__codact-failure-worker',
        encodeWorkerPayload(failureBody),
      ]).pipe(Effect.provide(makePlatformLayer(home)));

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('CLI analytics identity safety', () => {
    it.effect('does not attribute events to a stale identity when the active key differs', () => {
      const home = tempy.temporaryDirectory();
      const scriptPath = `${home}/composio.ts`;
      enableTelemetry('uak_user_a');
      process.argv[1] = scriptPath;

      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(scriptPath, '');
        yield* linkApolloIdentityForAnalytics('om_user_a');
        childProcessMocks.spawn.mockClear();

        // A script running under a different credential must not inherit user A.
        vi.stubEnv('COMPOSIO_USER_API_KEY', 'uak_user_b');
        yield* trackCliEventEffect({ name: 'producer_event' });

        const args = childProcessMocks.spawn.mock.calls[0]![1] as string[];
        const payload = decodeWorkerPayload<{ distinctId: string; installId: string }>(args[2]!);
        expect(payload.distinctId).not.toBe('om_user_a');
        // The install_id is already merged into user A's PostHog person, so
        // reusing it would still attribute to A. Must be a never-merged id.
        expect(payload.distinctId).not.toBe(payload.installId);
        expect(payload.distinctId.startsWith('user_')).toBe(true);
      }).pipe(Effect.provide(makePlatformLayer(home)));
    });

    it.effect('binds identity to the credential the caller passes, not one read back', () => {
      const home = tempy.temporaryDirectory();
      const scriptPath = `${home}/composio.ts`;
      // Mirrors real login: identity is resolved BEFORE the credential is persisted,
      // so nothing readable from disk/env identifies the user yet.
      enableTelemetry('');
      process.argv[1] = scriptPath;

      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(scriptPath, '');

        yield* linkApolloIdentityForAnalytics('om_login_user', 'uak_fresh');
        childProcessMocks.spawn.mockClear();

        // The credential is active from here on.
        vi.stubEnv('COMPOSIO_USER_API_KEY', 'uak_fresh');
        yield* trackCliEventEffect({ name: 'producer_event' });

        const args = childProcessMocks.spawn.mock.calls[0]![1] as string[];
        const payload = decodeWorkerPayload<{ distinctId: string }>(args[2]!);
        expect(payload.distinctId).toBe('om_login_user');
      }).pipe(Effect.provide(makePlatformLayer(home)));
    });

    it.effect('does not reuse the aliased install_id after logout', () => {
      const home = tempy.temporaryDirectory();
      const scriptPath = `${home}/composio.ts`;
      enableTelemetry('uak_logged_in');
      process.argv[1] = scriptPath;

      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(scriptPath, '');

        yield* linkApolloIdentityForAnalytics('om_logged_in', 'uak_logged_in');
        yield* clearApolloIdentityForAnalytics;
        childProcessMocks.spawn.mockClear();

        // Signed out: no credential at all.
        vi.stubEnv('COMPOSIO_USER_API_KEY', '');
        yield* trackCliEventEffect({ name: 'producer_event' });

        const args = childProcessMocks.spawn.mock.calls[0]![1] as string[];
        const payload = decodeWorkerPayload<{ distinctId: string; installId: string }>(args[2]!);
        expect(payload.distinctId).not.toBe('om_logged_in');
        // Bare install_id now resolves to the logged-out user's person.
        expect(payload.distinctId).not.toBe(payload.installId);
        expect(payload.distinctId).toBe(`anon_${payload.installId}`);
      }).pipe(Effect.provide(makePlatformLayer(home)));
    });

    it.effect('attaches org_id from user config to events', () => {
      const home = tempy.temporaryDirectory();
      const scriptPath = `${home}/composio.ts`;
      enableTelemetry();
      vi.stubEnv('COMPOSIO_CACHE_DIR', `${home}/.composio`);
      process.argv[1] = scriptPath;

      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.writeFileString(scriptPath, '');
        const composioDir = path.join(home, '.composio');
        yield* fs.makeDirectory(composioDir, { recursive: true });
        yield* fs.writeFileString(
          path.join(composioDir, USER_CONFIG_FILE_NAME),
          JSON.stringify({ api_key: 'uak_test', org_id: 'org_acme' })
        );

        yield* trackCliEventEffect({ name: 'producer_event' });

        const args = childProcessMocks.spawn.mock.calls[0]![1] as string[];
        const payload = decodeWorkerPayload<{ properties?: { org_id?: string } }>(args[2]!);
        expect(payload.properties?.org_id).toBe('org_acme');
      }).pipe(Effect.provide(makePlatformLayer(home)));
    });

    it.effect('reads the user config from COMPOSIO_CACHE_DIR rather than the homedir', () => {
      const home = tempy.temporaryDirectory();
      const cacheDir = tempy.temporaryDirectory();
      const scriptPath = `${home}/composio.ts`;
      enableTelemetry();
      vi.stubEnv('COMPOSIO_CACHE_DIR', cacheDir);
      process.argv[1] = scriptPath;

      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.writeFileString(scriptPath, '');
        // The user config exists only in the relocated cache dir; ~/.composio
        // never receives a copy.
        yield* fs.writeFileString(
          path.join(cacheDir, USER_CONFIG_FILE_NAME),
          JSON.stringify({ api_key: 'uak_test', org_id: 'org_cache_dir' })
        );

        yield* trackCliEventEffect({ name: 'producer_event' });

        const args = childProcessMocks.spawn.mock.calls[0]![1] as string[];
        const payload = decodeWorkerPayload<{ properties?: { org_id?: string } }>(args[2]!);
        expect(payload.properties?.org_id).toBe('org_cache_dir');
      }).pipe(Effect.provide(makePlatformLayer(home)));
    });

    it.effect('does not create the identity file when logging out with telemetry disabled', () => {
      const home = tempy.temporaryDirectory();
      enableTelemetry();
      vi.stubEnv('COMPOSIO_DISABLE_TELEMETRY', 'true');

      return Effect.gen(function* () {
        yield* clearApolloIdentityForAnalytics;

        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const exists = yield* fs.exists(path.join(home, '.composio', 'analytics.json'));
        expect(exists).toBe(false);
      }).pipe(Effect.provide(makePlatformLayer(home)));
    });

    it.effect('rotates to a fresh install_id when a second Apollo user links', () => {
      const home = tempy.temporaryDirectory();
      const scriptPath = `${home}/composio.ts`;
      enableTelemetry();
      process.argv[1] = scriptPath;

      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.writeFileString(scriptPath, '');

        yield* linkApolloIdentityForAnalytics('om_first_user');
        expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
        const firstArgs = childProcessMocks.spawn.mock.calls[0]![1] as string[];
        const firstPayload = decodeWorkerPayload<{ installId: string }>(firstArgs[2]!);

        // Logout, then log in as a different user on the same device: the
        // second user is aliased to a fresh install_id, never the one already
        // merged into the first user's PostHog person.
        yield* clearApolloIdentityForAnalytics;
        yield* linkApolloIdentityForAnalytics('om_second_user');
        expect(childProcessMocks.spawn).toHaveBeenCalledTimes(2);
        const secondArgs = childProcessMocks.spawn.mock.calls[1]![1] as string[];
        const secondPayload = decodeWorkerPayload<{
          event: string;
          distinctId: string;
          installId: string;
          properties: { alias: string };
        }>(secondArgs[2]!);
        expect(secondPayload.event).toBe('$create_alias');
        expect(secondPayload.distinctId).toBe('om_second_user');
        expect(secondPayload.installId).not.toBe(firstPayload.installId);
        expect(secondPayload.properties.alias).toBe(secondPayload.installId);

        const persisted = JSON.parse(
          yield* fs.readFileString(path.join(home, '.composio', 'analytics.json'), 'utf8')
        ) as {
          install_id: string;
          apollo_user_id: string;
          pending_alias_apollo_user_id: string;
        };
        expect(persisted.install_id).toBe(secondPayload.installId);
        expect(persisted.apollo_user_id).toBe('om_second_user');
        expect(persisted.pending_alias_apollo_user_id).toBe('om_second_user');
      }).pipe(Effect.provide(makePlatformLayer(home)));
    });

    it.effect('trusts the persisted identity when the api key lives in the OS keyring', () => {
      const home = tempy.temporaryDirectory();
      const scriptPath = `${home}/composio.ts`;
      // No env key and no plaintext api_key on disk -> no fingerprint.
      enableTelemetry('');
      vi.stubEnv('COMPOSIO_CACHE_DIR', `${home}/.composio`);
      process.argv[1] = scriptPath;

      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.writeFileString(scriptPath, '');
        const composioDir = path.join(home, '.composio');
        yield* fs.makeDirectory(composioDir, { recursive: true });
        yield* fs.writeFileString(
          path.join(composioDir, 'config.json'),
          JSON.stringify({ security: 'keychain-subprocess' })
        );
        yield* fs.writeFileString(
          path.join(composioDir, USER_CONFIG_FILE_NAME),
          JSON.stringify({ base_url: 'https://backend.example.test', org_id: 'org_keychain' })
        );
        yield* fs.writeFileString(
          path.join(composioDir, 'analytics.json'),
          JSON.stringify({
            install_id: 'install_keychain',
            apollo_user_id: 'om_keychain_user',
            aliased_apollo_user_id: 'om_keychain_user',
            api_key_fingerprint: 'abc.5',
          })
        );

        yield* trackCliEventEffect({ name: 'producer_event' });

        const args = childProcessMocks.spawn.mock.calls[0]![1] as string[];
        const payload = decodeWorkerPayload<{ distinctId: string }>(args[2]!);
        expect(payload.distinctId).toBe('om_keychain_user');
      }).pipe(Effect.provide(makePlatformLayer(home)));
    });

    it.effect('does not reuse a stale keychain identity when logout loses the state lock', () => {
      const home = tempy.temporaryDirectory();
      const scriptPath = `${home}/composio.ts`;
      enableTelemetry('');
      vi.stubEnv('COMPOSIO_CACHE_DIR', `${home}/.composio`);
      process.argv[1] = scriptPath;

      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.writeFileString(scriptPath, '');
        const composioDir = path.join(home, '.composio');
        yield* fs.makeDirectory(composioDir, { recursive: true });
        yield* fs.writeFileString(
          path.join(composioDir, 'config.json'),
          JSON.stringify({ security: 'keychain-subprocess' })
        );
        // Logout persists an empty credential record but intentionally keeps
        // user_data.json in place.
        yield* fs.writeFileString(
          path.join(composioDir, USER_CONFIG_FILE_NAME),
          JSON.stringify({ base_url: 'https://backend.example.test' })
        );
        yield* fs.writeFileString(
          path.join(composioDir, 'analytics.json'),
          JSON.stringify({
            install_id: 'install_keychain_logout',
            apollo_user_id: 'om_logged_out_keychain_user',
            aliased_apollo_user_id: 'om_logged_out_keychain_user',
          })
        );
        const lockPath = path.join(composioDir, 'analytics.json.lock');
        yield* fs.writeFileString(lockPath, 'other-process');

        // The clear is best-effort and times out while another process owns
        // the lock, leaving the old identity on disk.
        yield* clearApolloIdentityForAnalytics;
        yield* fs.remove(lockPath);
        childProcessMocks.spawn.mockClear();

        yield* trackCliEventEffect({ name: 'producer_event' });

        const args = childProcessMocks.spawn.mock.calls[0]![1] as string[];
        const payload = decodeWorkerPayload<{ distinctId: string; installId: string }>(args[2]!);
        expect(payload.distinctId).not.toBe('om_logged_out_keychain_user');
        expect(payload.distinctId).toBe(`anon_${payload.installId}`);
      }).pipe(Effect.provide(makePlatformLayer(home)));
    });

    it.effect('does not trust a fingerprint-less identity outside keychain modes', () => {
      const home = tempy.temporaryDirectory();
      const scriptPath = `${home}/composio.ts`;
      enableTelemetry('');
      vi.stubEnv('COMPOSIO_CACHE_DIR', `${home}/.composio`);
      process.argv[1] = scriptPath;

      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.writeFileString(scriptPath, '');
        const composioDir = path.join(home, '.composio');
        yield* fs.makeDirectory(composioDir, { recursive: true });
        yield* fs.writeFileString(
          path.join(composioDir, 'config.json'),
          JSON.stringify({ security: 'json' })
        );
        yield* fs.writeFileString(
          path.join(composioDir, USER_CONFIG_FILE_NAME),
          JSON.stringify({ org_id: 'org_json' })
        );
        yield* fs.writeFileString(
          path.join(composioDir, 'analytics.json'),
          JSON.stringify({
            install_id: 'install_json',
            apollo_user_id: 'om_json_user',
            aliased_apollo_user_id: 'om_json_user',
            api_key_fingerprint: 'abc.5',
          })
        );

        yield* trackCliEventEffect({ name: 'producer_event' });

        const args = childProcessMocks.spawn.mock.calls[0]![1] as string[];
        const payload = decodeWorkerPayload<{ distinctId: string }>(args[2]!);
        expect(payload.distinctId).toBe('anon_install_json');
      }).pipe(Effect.provide(makePlatformLayer(home)));
    });

    it.effect('redacts secret-shaped tokens from event properties', () => {
      const home = tempy.temporaryDirectory();
      const scriptPath = `${home}/composio.ts`;
      enableTelemetry();
      process.argv[1] = scriptPath;

      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(scriptPath, '');

        yield* trackCliEventEffect({
          name: CLI_ANALYTICS_EVENTS.CLI_COMMAND_FAILED,
          properties: {
            error_message: 'Auth failed for uak_AbC123xyz_secret via Bearer eyJhbGciOi.Jt0ken',
            nested: { tokens: ['ghp_ABCdef1234567890'] },
            duration_ms: 42,
          },
        });

        const args = childProcessMocks.spawn.mock.calls[0]![1] as string[];
        const payload = decodeWorkerPayload<{
          properties: {
            error_message: string;
            nested: { tokens: string[] };
            duration_ms: number;
          };
        }>(args[2]!);
        expect(payload.properties.error_message).toBe('Auth failed for [redacted] via [redacted]');
        expect(payload.properties.nested.tokens).toEqual(['[redacted]']);
        expect(payload.properties.duration_ms).toBe(42);
      }).pipe(Effect.provide(makePlatformLayer(home)));
    });
  });
});
