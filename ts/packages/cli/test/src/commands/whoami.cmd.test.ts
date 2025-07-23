import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, TestLive, MockConsole } from 'test/__utils__';

describe('CLI: composio whoami', () => {
  const testConfigProvider = ConfigProvider.fromMap(
    new Map([['COMPOSIO_API_KEY', 'api_key_from_test_config_provider']])
  ).pipe(extendConfigProvider);

  layer(TestLive({ baseConfigProvider: testConfigProvider }))('with config override', it => {
    it.scoped('[Given] `COMPOSIO_API_KEY` [Then] prints it to stdout', () =>
      Effect.gen(function* () {
        const args = ['whoami'];
        yield* cli(args);

        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain(`API KEY: api_key_from_test_config_provider`);
      })
    );
  });

  layer(TestLive({ fixture: 'user-config-example' }))('with fixture', it => {
    it.scoped('[Given] user_data.json in fixture [Then] prints its `api_key` to stdout', () =>
      Effect.gen(function* () {
        const args = ['whoami'];
        yield* cli(args);

        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain(`API KEY: api_key_from_test_fixture`);
      })
    );
  });
});
