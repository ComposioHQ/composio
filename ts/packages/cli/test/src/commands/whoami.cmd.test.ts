import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect, Layer } from 'effect';
import { cli, TestLive, MockConsole } from 'test/__utils__';

describe('CLI: composio whoami', () => {
  // Create a mock config provider using a map with test data.
  // Note: `process.env.COMPOSIO_API_KEY` is interpreted as Config.string('API_KEY')
  // after prefix stripping
  const mockConfigProvider = ConfigProvider.fromMap(
    new Map([['API_KEY', 'api_key_from_test_env']])
  );

  layer(TestLive().pipe(Layer.provide(Layer.setConfigProvider(mockConfigProvider))))(it => {
    it.scoped('[Given] `COMPOSIO_API_KEY` env var [Then] prints it in stdout', () =>
      Effect.gen(function* () {
        const args = ['whoami'];
        yield* cli(args);

        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain(`API KEY: api_key_from_test_env`);
      })
    );
  });
});
