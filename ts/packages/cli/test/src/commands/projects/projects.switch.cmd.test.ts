import { Effect } from 'effect';
import { describe, expect, layer } from '@effect/vitest';
import { cli, MockConsole, TestLive } from 'test/__utils__';

describe('CLI: composio manage projects switch', () => {
  layer(TestLive())(it => {
    it.scoped('[Then] it reports global developer project switching is deprecated', () =>
      Effect.gen(function* () {
        yield* cli(['manage', 'projects', 'switch']).pipe(Effect.catchAll(() => Effect.void));
        const output = (yield* MockConsole.getLines({ stripAnsi: true })).join('\n');
        expect(output).toContain('Global developer project switching is no longer supported');
        expect(output).toContain('composio dev init');
      })
    );
  });
});
