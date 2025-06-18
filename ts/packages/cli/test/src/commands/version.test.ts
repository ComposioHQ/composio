import { vi, describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { cli, pkg, TestLive, MockConsole } from 'test/__utils__';

describe('CLI: composio', () => {
  layer(TestLive())(it => {
    it.effect("[Given] no arguments [Then] prints composio's version from package.json", () =>
      Effect.gen(function* () {
        const args = ['version'];
        yield* cli(args);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain(pkg.version);
      })
    );

    it.effect('[Given] DEBUG_OVERRIDE_VERSION env var [Then] prints overridden version', () =>
      Effect.gen(function* () {
        const expectedVersion = '1.2.3-test';
        vi.stubEnv('DEBUG_OVERRIDE_VERSION', expectedVersion);

        const args = ['version'];
        yield* cli(args);
        const lines = yield* MockConsole.getLines();
        const output = lines.join('\n');
        expect(output).toContain(expectedVersion);
      })
    );
  });
});
