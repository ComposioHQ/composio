import { inspect } from 'node:util';
import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { cli, TestLive } from 'test/__utils__';

describe('CLI: unknown root command', () => {
  layer(TestLive())('[Given] a command this CLI version does not know', it => {
    it.scoped('[Then] suggests composio upgrade (stale installs self-heal)', () =>
      Effect.gen(function* () {
        const exit = yield* cli(['definitely-not-a-command']).pipe(Effect.exit);
        expect(exit._tag).toBe('Failure');
        const rendered = inspect(exit, { depth: 20 });
        expect(rendered).toContain('composio upgrade');
        expect(rendered).toContain("Unknown command 'definitely-not-a-command'");
      })
    );

    it.scoped('[Then] flags-only invocations are untouched', () =>
      Effect.gen(function* () {
        // `--help`-style paths must not hit the unknown-command branch.
        const exit = yield* cli(['--help']).pipe(Effect.exit);
        expect(exit._tag).toBe('Success');
      })
    );
  });
});
