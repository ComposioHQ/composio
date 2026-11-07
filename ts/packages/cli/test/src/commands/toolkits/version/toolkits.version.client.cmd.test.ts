import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { cli, MockConsole, TestLive } from 'test/__utils__';
import { exitCodeOf } from 'test/__utils__/exit-code';
import { stubClientResources } from 'test/__utils__/services/stub-composio-client';

const testLayer = TestLive({
  baseConfigProvider: ConfigProvider.fromEnv({ env: { COMPOSIO_USER_API_KEY: 'test_api_key' } }),
});

describe('CLI: composio dev toolkits version over the API client', () => {
  layer(testLayer)('[Given] a toolkit the API does not know', it => {
    it.effect('[Then] the API message and the browse hint are printed', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(['toolkits'], () =>
          Response.json(
            {
              error: {
                message: 'Toolkit unknown not found',
                code: 1803,
                slug: 'Toolkit_NotFound',
                status: 404,
              },
            },
            { status: 404 }
          )
        );
        const exit = yield* Effect.exit(
          cli(['dev', 'toolkits', 'version', 'unknown']).pipe(Effect.provide(stub.layer))
        );
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(lines).toEqual([
          'Toolkit unknown not found',
          'Browse available toolkits:\n> composio dev toolkits list',
        ]);
        expect(exitCodeOf(exit)).toBe(1);
        expect(stub.requests).toEqual([{ method: 'GET', path: '/api/v3.1/toolkits/unknown' }]);
      })
    );
  });

  layer(testLayer)('[Given] a toolkit response without the fields the catalog requires', it => {
    it.effect('[Then] the versions it does carry are printed', () =>
      Effect.gen(function* () {
        const stub = stubClientResources(['toolkits'], () =>
          Response.json({
            slug: 'gmail',
            name: 'Gmail',
            meta: { available_versions: ['20260101_00', '20260201_00'] },
          })
        );
        yield* cli(['dev', 'toolkits', 'version', 'gmail']).pipe(Effect.provide(stub.layer));
        const lines = yield* MockConsole.getLines({ stripAnsi: true });

        expect(lines).toEqual([
          'Fetching versions for toolkit "gmail"...',
          'Toolkit: Gmail (gmail)\nLatest Version: 20260201_00\nLast 2 Available Versions:\n- 20260101_00\n- 20260201_00',
          JSON.stringify(
            {
              slug: 'gmail',
              latest_version: '20260201_00',
              available_versions_last_20: ['20260101_00', '20260201_00'],
            },
            null,
            2
          ),
        ]);
      })
    );
  });
});
