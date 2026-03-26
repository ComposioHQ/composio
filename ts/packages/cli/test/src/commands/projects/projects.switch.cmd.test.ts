import { Effect } from 'effect';
import { describe, expect, layer } from '@effect/vitest';
import { cli, MockConsole, TestLive } from 'test/__utils__';

describe('CLI: composio dev projects switch', () => {
  layer(TestLive())(it => {
    it.scoped('[Then] it reports global developer project switching is deprecated', () =>
      Effect.gen(function* () {
        yield* cli(['dev', 'projects', 'switch']).pipe(Effect.catchAll(() => Effect.void));
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toMatch(/composio dev init/);
      })
    );
  });
});
