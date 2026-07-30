import { describe, expect, it } from '@effect/vitest';
import { afterEach, vi } from 'vitest';
import { FetchHttpClient, FileSystem, Path } from '@effect/platform';
import { BunFileSystem, BunPath } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import * as tempy from 'tempy';
import { trackCliEventEffect } from 'src/analytics/dispatch';
import { APP_VERSION } from 'src/constants';
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

const originalExecPath = process.execPath;

const decodeWorkerPayload = <A>(encodedPayload: string): A => {
  const normalized = encodedPayload.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(atob(padded)) as A;
};

describe('CLI analytics installed-version resolution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.execPath = originalExecPath;
  });

  it.effect('reports the release-tag version instead of the compiled-in constant', () => {
    const home = tempy.temporaryDirectory();
    const installDir = tempy.temporaryDirectory();
    vi.stubEnv('COMPOSIO_BASE_URL', 'https://backend.example.test');
    vi.stubEnv('COMPOSIO_USER_API_KEY', 'uak_test');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CI', 'false');
    vi.stubEnv('COMPOSIO_CLI_TELEMETRY_DISABLED', 'false');
    vi.stubEnv('TELEMETRY_DISABLED', 'false');
    vi.stubEnv('COMPOSIO_DISABLE_TELEMETRY', 'false');

    const child = {
      once: childProcessMocks.once,
      removeListener: childProcessMocks.removeListener,
      unref: childProcessMocks.unref,
    };
    childProcessMocks.once.mockReset().mockImplementation((event: string, listener: () => void) => {
      if (event === 'spawn') {
        listener();
      }
      return child;
    });
    childProcessMocks.removeListener.mockReset().mockReturnValue(child);
    childProcessMocks.spawn.mockReset().mockReturnValue(child);
    childProcessMocks.unref.mockReset();

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.writeFileString(path.join(installDir, 'release-tag.txt'), '@composio/cli@0.4.2\n');
      process.execPath = path.join(installDir, 'composio');

      yield* trackCliEventEffect({
        name: 'producer_event',
        properties: { cli_version: APP_VERSION },
      });

      expect(childProcessMocks.spawn).toHaveBeenCalledTimes(1);
      const [, args] = childProcessMocks.spawn.mock.calls[0] as unknown as [string, string[]];
      const envelope = decodeWorkerPayload<{ properties: Record<string, unknown> }>(args.at(-1)!);
      expect(envelope.properties.cli_version).toBe('0.4.2');
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          BunFileSystem.layer,
          BunPath.layer,
          FetchHttpClient.layer,
          TerminalUITest,
          Layer.succeed(NodeOs, defaultNodeOs({ homedir: home }))
        )
      )
    );
  });
});
