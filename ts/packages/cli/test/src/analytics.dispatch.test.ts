import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FetchHttpClient, FileSystem, Path } from '@effect/platform';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import * as tempy from 'tempy';
import {
  getCurrentCwdSessionId,
  readApiBaseUrl,
  runBackgroundWorkerFromArgv,
  trackCliCodactFailureEffect,
  trackCliEventEffect,
} from 'src/analytics/dispatch';
import { APP_VERSION, USER_CONFIG_FILE_NAME } from 'src/constants';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';
import { TerminalUITest } from 'test/__utils__/services/terminal-ui-test';

const childProcessMocks = vi.hoisted(() => ({
  on: vi.fn(),
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
      on: childProcessMocks.on,
      unref: childProcessMocks.unref,
    };
    childProcessMocks.on.mockReset().mockReturnValue(child);
    childProcessMocks.spawn.mockReset().mockReturnValue(child);
    childProcessMocks.unref.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.argv = [...originalArgv];
  });

  it('reads configuration and the freshest current-directory session via platform services', () => {
    const home = tempy.temporaryDirectory();
    const cacheDir = tempy.temporaryDirectory();
    const cwd = '/workspace/project';
    vi.stubEnv('COMPOSIO_CACHE_DIR', cacheDir);
    vi.stubEnv('COMPOSIO_BASE_URL', '');

    return Effect.runPromise(
      Effect.gen(function* () {
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
                  expiresAt: new Date(Date.now() + 30_000).toISOString(),
                },
              },
            },
            newer: {
              probablyMyCliSessionsByCwdHash: {
                [cwdHash(cwd)]: {
                  id: 'cli_s_newer',
                  expiresAt: new Date(Date.now() + 60_000).toISOString(),
                },
              },
            },
          })
        );

        expect(yield* readApiBaseUrl).toBe('https://backend.example.test');
        expect(yield* getCurrentCwdSessionId(cwd)).toBe('cli_s_newer');
      }).pipe(Effect.provide(makePlatformLayer(home)))
    );
  });

  it('ignores malformed worker payloads', () => {
    const home = tempy.temporaryDirectory();

    return Effect.runPromise(
      runBackgroundWorkerFromArgv([
        process.execPath,
        'composio',
        '__analytics-worker',
        'not-base64',
      ]).pipe(Effect.provide(makePlatformLayer(home)))
    );
  });

  it('delivers analytics worker payloads to the configured endpoint', () => {
    const home = tempy.temporaryDirectory();
    const envelope = {
      event: 'cli_command_invoked',
      sentAt: '2026-07-16T00:00:00.000Z',
      source: 'cli' as const,
      distinctId: 'anon_test',
      installId: 'install_test',
    };
    const encodedPayload = btoa(JSON.stringify(envelope))
      .replace(/\+/gu, '-')
      .replace(/\//gu, '_')
      .replace(/=+$/u, '');
    vi.stubEnv('COMPOSIO_BASE_URL', 'https://backend.example.test');
    vi.stubEnv('COMPOSIO_USER_API_KEY', 'uak_test');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CI', 'false');
    vi.stubEnv('COMPOSIO_CLI_TELEMETRY_DISABLED', 'false');
    vi.stubEnv('TELEMETRY_DISABLED', 'false');
    vi.stubEnv('COMPOSIO_DISABLE_TELEMETRY', 'false');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    return Effect.runPromise(
      runBackgroundWorkerFromArgv([
        process.execPath,
        'composio',
        '__analytics-worker',
        encodedPayload,
      ]).pipe(Effect.provide(makePlatformLayer(home)))
    ).then(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [endpoint, request] = fetchSpy.mock.calls[0]!;
      expect(String(endpoint)).toBe('https://backend.example.test/api/v3/cli/analytics');
      expect(request).toMatchObject({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-composio-analytics-source': 'cli',
          'x-user-api-key': 'uak_test',
        }),
      });
      expect(JSON.parse(new TextDecoder().decode(request?.body as Uint8Array))).toEqual(envelope);
    });
  });

  it('spawns a detached analytics worker with a decodable envelope', () => {
    const home = tempy.temporaryDirectory();
    const scriptPath = `${home}/composio.ts`;
    enableTelemetry();
    process.argv[1] = scriptPath;

    return Effect.runPromise(
      Effect.gen(function* () {
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
        expect(childProcessMocks.on).toHaveBeenCalledWith('error', expect.any(Function));
        expect(childProcessMocks.unref).toHaveBeenCalledTimes(1);
      }).pipe(Effect.provide(makePlatformLayer(home)))
    );
  });

  it('spawns a detached codact worker with a decodable failure body', () => {
    const home = tempy.temporaryDirectory();
    const scriptPath = `${home}/composio.ts`;
    enableTelemetry();
    vi.stubEnv('COMPOSIO_CLI_INVOCATION_ORIGIN', 'agent');
    vi.stubEnv('COMPOSIO_CLI_PARENT_RUN_ID', 'run_parent');
    process.argv[1] = scriptPath;

    return Effect.runPromise(
      Effect.gen(function* () {
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
        expect(childProcessMocks.on).toHaveBeenCalledWith('error', expect.any(Function));
        expect(childProcessMocks.unref).toHaveBeenCalledTimes(1);
      }).pipe(Effect.provide(makePlatformLayer(home)))
    );
  });

  it('keeps both producer effects non-fatal when spawn throws', () => {
    const home = tempy.temporaryDirectory();
    enableTelemetry();
    childProcessMocks.spawn.mockImplementation(() => {
      throw new Error('spawn failed');
    });

    return Effect.runPromise(
      Effect.gen(function* () {
        yield* trackCliEventEffect({ name: 'producer_event' });
        yield* trackCliCodactFailureEffect({
          failureType: 'wrong_tool_slug',
          ctx: { slug: 'MISSING_TOOL' },
        });

        expect(childProcessMocks.spawn).toHaveBeenCalledTimes(2);
        expect(childProcessMocks.unref).not.toHaveBeenCalled();
      }).pipe(Effect.provide(makePlatformLayer(home)))
    );
  });

  it('honors Effect boolean config when telemetry is disabled', () => {
    const home = tempy.temporaryDirectory();
    enableTelemetry();
    vi.stubEnv('COMPOSIO_CLI_TELEMETRY_DISABLED', 'yes');

    return Effect.runPromise(
      Effect.gen(function* () {
        yield* trackCliEventEffect({ name: 'producer_event' });
        yield* trackCliCodactFailureEffect({
          failureType: 'wrong_tool_slug',
          ctx: { slug: 'MISSING_TOOL' },
        });

        expect(childProcessMocks.spawn).not.toHaveBeenCalled();
      }).pipe(Effect.provide(makePlatformLayer(home)))
    );
  });

  it('delivers codact worker failures with the user key and session body', () => {
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

    return Effect.runPromise(
      runBackgroundWorkerFromArgv([
        process.execPath,
        'composio',
        '__codact-failure-worker',
        encodeWorkerPayload(failureBody),
      ]).pipe(Effect.provide(makePlatformLayer(home)))
    ).then(() => {
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

  it('ignores malformed codact worker payloads', () => {
    const home = tempy.temporaryDirectory();
    enableTelemetry();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    return Effect.runPromise(
      runBackgroundWorkerFromArgv([
        process.execPath,
        'composio',
        '__codact-failure-worker',
        'not-base64',
      ]).pipe(Effect.provide(makePlatformLayer(home)))
    ).then(() => {
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  it('skips codact worker delivery without a user key', () => {
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

    return Effect.runPromise(
      runBackgroundWorkerFromArgv([
        process.execPath,
        'composio',
        '__codact-failure-worker',
        encodeWorkerPayload(failureBody),
      ]).pipe(Effect.provide(makePlatformLayer(home)))
    ).then(() => {
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
