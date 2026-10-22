import { describe, expect, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { detectMasterFromHost } from 'src/services/master-detector';
import { cli, MockConsole, TestLive } from 'test/__utils__';

describe('CLI: composio debug who-is-my-master', () => {
  layer(TestLive())(it => {
    // The host environment decides the answer, so the test reads it through the same detector.
    it.effect('[Then] prints the detected master as indented JSON on stdout', () =>
      Effect.gen(function* () {
        const master = yield* detectMasterFromHost;
        yield* cli(['debug', 'who-is-my-master']);

        expect(yield* MockConsole.getLines({ stream: 'stdout' })).toEqual([
          JSON.stringify({ master }, null, 2),
        ]);
      })
    );
  });
});
