import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileSystem, Path } from '@effect/platform';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import * as tempy from 'tempy';
import {
  getCurrentCwdSessionId,
  readApiBaseUrl,
  runBackgroundWorkerFromArgv,
} from 'src/analytics/dispatch';
import { USER_CONFIG_FILE_NAME } from 'src/constants';
import { defaultNodeOs, NodeOs } from 'src/services/node-os';

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
    Layer.succeed(NodeOs, defaultNodeOs({ homedir: home }))
  );

describe('CLI analytics dispatch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
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
    vi.stubEnv('COMPOSIO_CLI_TELEMETRY_DISABLED', '');
    vi.stubEnv('TELEMETRY_DISABLED', '');
    vi.stubEnv('COMPOSIO_DISABLE_TELEMETRY', '');
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
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://backend.example.test/api/v3/cli/analytics',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-composio-analytics-source': 'cli',
            'x-user-api-key': 'uak_test',
          }),
          body: JSON.stringify(envelope),
        })
      );
    });
  });
});
