import * as fs from 'node:fs';
import { describe, expect, layer } from '@effect/vitest';
import { vi } from 'vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';
import { liveEnvConfigProvider } from 'test/__utils__/live-env-config-provider';

// The encoder companion is missing: the loader fails the way a damaged install
// whose repair download also failed does. Every other companion loads as usual.
vi.mock('src/services/run-companion-modules', async importOriginal => {
  const actual = await importOriginal<typeof import('src/services/run-companion-modules')>();
  const { Effect } = await import('effect');
  return {
    ...actual,
    loadInstalledCompanionModule: (baseName: string, requiredExports: ReadonlyArray<string>) =>
      baseName === 'execute-output-encoder-runtime'
        ? Effect.fail(
            new actual.RunCompanionRepairError({
              message: "Unable to restore the CLI's bundled support files.",
            })
          )
        : actual.loadInstalledCompanionModule<Record<string, unknown>>(baseName, requiredExports),
  };
});

vi.hoisted(() => {
  delete process.env.CI;
});

const testArtifactConfigProvider = liveEnvConfigProvider.pipe(
  ConfigProvider.mapInput(configPath =>
    configPath.map(segment =>
      segment === 'SESSION_DIR'
        ? 'CACHE_DIR'
        : typeof segment === 'string'
          ? `UNSET_${segment}`
          : segment
    )
  )
);

const largeOutputConfigProvider = ConfigProvider.fromEnvRecord({
  COMPOSIO_USER_API_KEY: 'test_api_key',
}).pipe(ConfigProvider.orElse(testArtifactConfigProvider), extendConfigProvider);

const parseLastJson = (lines: ReadonlyArray<string>): Record<string, unknown> => {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line) continue;
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch {
      // keep searching for the last JSON line
    }
  }
  throw new Error('Expected JSON output but none found');
};

describe('CLI: composio execute without the encoder companion', () => {
  layer(
    TestLive({
      baseConfigProvider: largeOutputConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        respondWith: {
          data: { content: 'token '.repeat(20_000) },
          error: null,
          successful: true,
          logId: 'log_encoder_missing',
        },
      },
    })
  )('[Given] a large response [Then] it estimates the token count instead of failing', it => {
    it.effect('stores the payload with a byte-based token estimate', () =>
      Effect.gen(function* () {
        yield* cli(['execute', 'GMAIL_SEND_EMAIL', '-d', '{"recipient":"a"}']);
        const lines = yield* MockConsole.getLines({ stripAnsi: true });
        const output = parseLastJson(lines) as {
          successful: boolean;
          storedInFile: boolean;
          tokenCount: number;
          outputFilePath: string;
        };

        expect(output.successful).toBe(true);
        expect(output.storedInFile).toBe(true);
        const storedJson = fs.readFileSync(output.outputFilePath, 'utf8');
        expect(output.tokenCount).toBe(Math.ceil(Buffer.byteLength(storedJson, 'utf8') / 4));

        fs.rmSync(output.outputFilePath.slice(0, output.outputFilePath.lastIndexOf('/')), {
          recursive: true,
          force: true,
        });
      })
    );
  });

  layer(
    TestLive({
      baseConfigProvider: largeOutputConfigProvider,
      fixture: 'global-test-user-id',
      stdin: { isTTY: true, data: '' },
      toolsExecutor: {
        respondWith: {
          data: { content: 'token '.repeat(2_000) },
          error: null,
          successful: true,
          logId: 'log_encoder_missing_estimate_below_threshold',
        },
      },
    })
  )(
    '[Given] a response past the byte pre-filter whose estimate is below the threshold [Then] it is still stored',
    it => {
      it.effect('does not print an unmeasured response inline', () =>
        Effect.gen(function* () {
          yield* cli(['execute', 'GMAIL_SEND_EMAIL', '-d', '{"recipient":"a"}']);
          const lines = yield* MockConsole.getLines({ stripAnsi: true });
          const output = parseLastJson(lines) as {
            successful: boolean;
            storedInFile: boolean;
            tokenCount: number;
            outputFilePath: string;
          };

          expect(output.successful).toBe(true);
          expect(output.storedInFile).toBe(true);
          expect(output.tokenCount).toBeLessThan(10_000);

          fs.rmSync(output.outputFilePath.slice(0, output.outputFilePath.lastIndexOf('/')), {
            recursive: true,
            force: true,
          });
        })
      );
    }
  );
});
