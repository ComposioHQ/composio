import { describe, expect, it } from '@effect/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { FetchHttpClient, FileSystem, Path } from '@effect/platform';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import * as tempy from 'tempy';
import {
  emitPostHogAlias,
  getCurrentCwdSessionId,
  linkApolloIdentityForAnalytics,
  readApiBaseUrl,
  runBackgroundWorkerFromArgv,
  trackCliCodactFailureEffect,
  trackCliEventEffect,
} from 'src/analytics/dispatch';
import { CLI_ANALYTICS_EVENTS } from 'src/analytics/events';
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
  vi.stubEnv('COMPOSIO_POSTHOG_KEY', 'phc_test_key');
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
        const composioDir = path.join(home, '.composio');
        yield* fs.makeDirectory(composioDir, { recursive: true });
        yield* fs.writeFileString(
          path.join(composioDir, USER_CONFIG_FILE_NAME),
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
    vi.stubEnv('COMPOSIO_POSTHOG_KEY', 'phc_test_key');
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
    vi.stubEnv('COMPOSIO_POSTHOG_KEY', '');
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
    vi.stubEnv('COMPOSIO_POSTHOG_KEY', '');
    process.argv[1] = scriptPath;

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(scriptPath, '');
      yield* trackCliEventEffect({ name: 'producer_event', properties: { sample: 'value' } });

      expect(childProcessMocks.spawn).not.toHaveBeenCalled();
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

  it.effect('keys post-login events on the persisted apollo_user_id', () => {
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
        JSON.stringify({ install_id: 'install_persisted', apollo_user_id: 'om_apollo_123' })
      );

      yield* trackCliEventEffect({ name: CLI_ANALYTICS_EVENTS.CLI_EXECUTE_SUCCEEDED });

      expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
      const args = childProcessMocks.spawn.mock.calls[0]![1] as string[];
      const payload = decodeWorkerPayload<{ distinctId: string; installId: string }>(args[2]!);
      expect(payload.distinctId).toBe('om_apollo_123');
      expect(payload.installId).toBe('install_persisted');
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

      // The Apollo id is persisted while keeping the original install_id/created_at.
      const persisted = JSON.parse(
        yield* fs.readFileString(path.join(composioDir, 'analytics.json'), 'utf8')
      ) as { install_id: string; apollo_user_id: string; created_at: string };
      expect(persisted).toMatchObject({
        install_id: 'install_login',
        apollo_user_id: 'om_apollo_login',
        created_at: '2026-01-01T00:00:00.000Z',
      });

      // A repeat login with the same Apollo id does not re-emit the alias.
      yield* linkApolloIdentityForAnalytics('om_apollo_login');
      expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
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
});
