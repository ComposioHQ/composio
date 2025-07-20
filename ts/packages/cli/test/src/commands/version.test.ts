import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, pkg, TestLive, MockConsole } from 'test/__utils__';

describe('CLI: composio', () => {
  const testConfigProvider = ConfigProvider.fromMap(
    new Map([['DEBUG_OVERRIDE_VERSION', '1.2.3-test']])
  ).pipe(extendConfigProvider);

  layer(TestLive())(it => {
    it.scoped("[Given] no arguments [Then] prints composio's version from package.json", () =>
      Effect.gen(function* () {
        const args = ['version'];
        yield* cli(args);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain(pkg.version);
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider }))('with config override', it => {
    it.scoped('[Given] `DEBUG_OVERRIDE_VERSION` env var [Then] prints overridden version', () =>
      Effect.gen(function* () {
        const args = ['version'];
        yield* cli(args);

        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain('1.2.3-test');
      })
    );
  });
});
