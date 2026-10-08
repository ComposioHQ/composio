import { describe, expect, layer } from '@effect/vitest';
import { ConfigProvider, Effect } from 'effect';
import { extendConfigProvider } from 'src/services/config';
import { cli, pkg, TestLive, MockConsole } from 'test/__utils__';

describe('CLI: composio', () => {
  const testConfigProvider = ConfigProvider.fromEnv({
    env: { DEBUG_OVERRIDE_VERSION: '1.2.3-test' },
  }).pipe(extendConfigProvider);

  layer(TestLive())(it => {
    it.effect("[Given] no arguments [Then] prints composio's version from package.json", () =>
      Effect.gen(function* () {
        const args = ['version'];
        yield* cli(args);
        // `composio version` writes the bare semver to stdout via `ui.output()`
        // (the data channel scripts parse). Assert the stdout stream directly
        // instead of the merged buffer, so decoration written elsewhere can
        // never leak into — or be mistaken for — this contract.
        const stdoutLines = yield* MockConsole.getLines({ stream: 'stdout' });
        expect(stdoutLines.length).toBeGreaterThan(0);
        for (const line of stdoutLines) {
          expect(line).toBe(pkg.version);
        }
      })
    );
  });

  layer(TestLive({ baseConfigProvider: testConfigProvider }))('with config override', it => {
    it.effect('[Given] `DEBUG_OVERRIDE_VERSION` env var [Then] prints overridden version', () =>
      Effect.gen(function* () {
        const args = ['version'];
        yield* cli(args);

        const stdoutLines = yield* MockConsole.getLines({ stream: 'stdout' });
        expect(stdoutLines.length).toBeGreaterThan(0);
        for (const line of stdoutLines) {
          expect(line).toBe('1.2.3-test');
        }
      })
    );
  });
});
