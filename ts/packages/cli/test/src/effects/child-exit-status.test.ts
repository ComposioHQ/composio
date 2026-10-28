import { describe, expect, layer } from '@effect/vitest';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect } from 'effect';
import { ChildProcess } from 'effect/process';
import { childExitStatus } from 'src/effects/child-exit-status';

// Runs real children through the installed spawner, so an Effect upgrade that changes how it
// reports a child a signal ended fails here instead of silently breaking `composio run`.
const statusOf = (script: string) =>
  ChildProcess.make(process.execPath, ['-e', script]).pipe(
    Effect.flatMap(childExitStatus),
    Effect.scoped
  );

describe('childExitStatus', () => {
  layer(BunServices.layer)(it => {
    it.effect('[Given] a child that exits [Then] reports its code', () =>
      Effect.gen(function* () {
        expect(yield* statusOf('process.exit(3)')).toEqual({ code: 3, signal: null });
      })
    );

    it.effect.each(['SIGINT', 'SIGTERM', 'SIGKILL'] as const)(
      '[Given] a child %s ends [Then] reports the signal',
      signal =>
        Effect.gen(function* () {
          expect(yield* statusOf(`process.kill(process.pid, '${signal}')`)).toEqual({
            code: null,
            signal,
          });
        })
    );
  });
});
